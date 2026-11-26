import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { mixedLocalActions } from "../lib/workflow-actions.ts";
import path from "node:path";

const WORKFLOWS = ".github/workflows";
const RESTORE = `      - name: Local actions from the workflow's commit
        env:
          WORKFLOW_SHA: \${{ github.workflow_sha }}
        run: |
          git cat-file -e "$WORKFLOW_SHA^{commit}" 2>/dev/null || git fetch --quiet --depth=1 origin "$WORKFLOW_SHA"
          rm -rf .github/actions
          git checkout "$WORKFLOW_SHA" -- .github/actions
`;

function workflow(steps: string): { readonly path: string; readonly text: string } {
  return {
    path: "release.yml",
    text: `name: Release\njobs:\n  pack:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`,
  };
}

const CHOSEN = `      - uses: actions/checkout@v4
        with:
          ref: \${{ needs.choose.outputs.sha }}
`;
const ONE_FINDING = 1;
const SETUP = "      - uses: ./.github/actions/setup\n";

it("the repo's workflows run every local action from the workflow's own commit", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const files = readdirSync(WORKFLOWS).map((name) => ({
    path: path.join(WORKFLOWS, name),
    text: readFileSync(path.join(WORKFLOWS, name), "utf8"),
  }));

  expect(mixedLocalActions(files)).toStrictEqual([]);
});

it("refuses a local action run after checking out the chosen commit", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(mixedLocalActions([workflow(`${CHOSEN}${SETUP}`)])).toStrictEqual([
    `release.yml: job pack, step 2 uses ./.github/actions/setup from the commit it checked out (ref: \${{ needs.choose.outputs.sha }}), not from the workflow's own commit. Add the step "Local actions from the workflow's commit" right after the checkout (docs/adr/0122-local-actions-come-from-the-workflows-own-commit.md).`,
  ]);
});

it("passes a local action once the workflow's own actions are restored", { timeout: 10_000 }, () => {
  expect.hasAssertions();
  expect(mixedLocalActions([workflow(`${CHOSEN}${RESTORE}${SETUP}`)])).toStrictEqual([]);
});

it("passes a local action after checking out the workflow's own commit", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const own = "      - uses: actions/checkout@v4\n";
  const pinned = `      - uses: actions/checkout@v4\n        with:\n          ref: \${{ github.workflow_sha }}\n`;

  expect(mixedLocalActions([workflow(`${own}${SETUP}`), workflow(`${pinned}${SETUP}`)])).toStrictEqual([]);
});

it("refuses a restore step whose commands differ from the one the ADR names", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const edited = RESTORE.replace("rm -rf .github/actions\n", "");

  expect(mixedLocalActions([workflow(`${CHOSEN}${edited}${SETUP}`)])).toHaveLength(ONE_FINDING);
});
