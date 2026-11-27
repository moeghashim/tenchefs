import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "../lib/tools.ts";
import { addUnreleasedChangeset } from "../lib/release-changeset.ts";
import path from "node:path";
import { tmpdir } from "node:os";

const VERSIONED = "9999aaaa";
const RELEASED = "012b8400";

interface Landed {
  readonly changed: readonly string[];
  readonly changedSinceVersioned?: readonly string[];
  readonly pending: Readonly<Record<string, string>>;
  readonly released: string;
  readonly versioned: string;
}

interface Added {
  readonly directory: string;
  readonly outcome: Outcome<string>;
}

const LANDED: Landed = { changed: [], pending: {}, released: "", versioned: VERSIONED };

function folder(pending: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(path.join(tmpdir(), "release-changeset-"));
  writeFileSync(path.join(directory, "README.md"), "# Changesets\n");
  writeFileSync(path.join(directory, "config.json"), "{}\n");
  for (const [name, content] of Object.entries(pending)) {
    writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

function added(overrides: Partial<Landed>): Added {
  const { changed, changedSinceVersioned = changed, pending, released, versioned } = { ...LANDED, ...overrides };
  const directory = folder(pending);
  const answers: readonly (readonly [string, string])[] = [
    ["-E", released],
    ["-G", versioned],
    [versioned, changedSinceVersioned.join("\n")],
    ["--format=%s", "Mention suggestions put recent posters first (#666)\nDelete a message (#678)"],
  ];
  const outcome = addUnreleasedChangeset({
    directory,
    git: (args): Outcome<string> => {
      const [, value] = answers.find(([flag]) => args.includes(flag)) ?? ["", changed.join("\n")];
      return { ok: true, value: `${value}\n` };
    },
  });
  return { directory, outcome };
}

function failingAt(failing: string): (args: readonly string[]) => Outcome<string> {
  return (args) => {
    if (args.includes(failing)) {
      return { ok: false, reason: `git ${failing} failed` };
    }
    return { ok: true, value: "" };
  };
}

it("adds a patch changeset when shipping code has landed with no changeset, so Release still cuts a patch release", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const { directory, outcome } = added({ changed: ["app/modules/cli/main.ts", "docs/agents.md"] });

  expect(outcome).toStrictEqual({
    ok: true,
    value: `added .changeset/unreleased-work.md: app/modules/cli/main.ts landed since ${VERSIONED} with no changeset, so this releases a patch`,
  });
  expect(readFileSync(path.join(directory, "unreleased-work.md"), "utf8")).toBe(
    [
      "---",
      '"@ai-hero/cookout": patch',
      "---",
      "",
      "Work that landed without a changeset:",
      "",
      "- Mention suggestions put recent posters first (#666)",
      "- Delete a message (#678)",
      "",
    ].join("\n"),
  );
});

it("adds nothing when a pending changeset already releases the package", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const pending = { "small-wasps-act.md": "---\n'@ai-hero/cookout': minor\n---\n\nA thing.\n" };
  const { directory, outcome } = added({ changed: ["app/main.ts"], pending });

  expect(outcome).toStrictEqual({
    ok: true,
    value: "added nothing: a pending changeset already releases @ai-hero/cookout",
  });
  expect(readdirSync(directory).toSorted()).toStrictEqual(["README.md", "config.json", "small-wasps-act.md"]);
});

it("adds a patch changeset when the only pending changesets release nothing", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const pending = { "funky-balloons-tell.md": "---\n---\n", "notes.md": "No frontmatter.\n" };
  const { directory } = added({ changed: ["app/main.ts"], pending });

  expect(readdirSync(directory)).toContain("unreleased-work.md");
});

it("adds nothing when only docs, tests and scripts changed since the last version", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const { outcome } = added({ changed: ["AGENTS.md", "scripts/check.ts", "app/x.test.ts"] });

  expect(outcome).toStrictEqual({ ok: true, value: `added nothing: no shipping code landed since ${VERSIONED}` });
});

it("adds nothing when only a test helper under a tests/ folder changed since the last version", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const { outcome } = added({ changed: ["app/modules/routes/tests/sidebar-keys.ts"] });

  expect(outcome).toStrictEqual({ ok: true, value: `added nothing: no shipping code landed since ${VERSIONED}` });
});

it("adds nothing when only the shared test utilities under app/modules/testing changed", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const { outcome } = added({
    changed: ["app/modules/testing/lib/calls-in-flight.ts", "app/modules/testing/index.ts"],
  });

  expect(outcome).toStrictEqual({ ok: true, value: `added nothing: no shipping code landed since ${VERSIONED}` });
});

it("counts from the newest Version Packages merge, even one that left the version unchanged", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const { outcome } = added({
    changed: ["app/modules/routes/tests/sidebar-keys.ts", "scripts/check.ts"],
    changedSinceVersioned: ["app/main.ts", "app/modules/routes/tests/sidebar-keys.ts", "scripts/check.ts"],
    released: RELEASED,
  });

  expect(outcome).toStrictEqual({ ok: true, value: `added nothing: no shipping code landed since ${RELEASED}` });
});

it("still adds a patch changeset when shipping code landed after the newest Version Packages merge", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const { outcome } = added({ changed: ["app/main.ts"], changedSinceVersioned: [], released: RELEASED });

  expect(outcome).toStrictEqual({
    ok: true,
    value: `added .changeset/unreleased-work.md: app/main.ts landed since ${RELEASED} with no changeset, so this releases a patch`,
  });
});

it.each([["app/modules/routes/index.ts"], ["package.json"]])(
  "still adds a patch changeset when %s, outside any tests/ folder, changed",
  { timeout: 1000 },
  (file) => {
    expect.hasAssertions();

    const { outcome } = added({ changed: ["app/modules/routes/tests/sidebar-keys.ts", file] });

    expect(outcome).toStrictEqual({
      ok: true,
      value: `added .changeset/unreleased-work.md: ${file} landed since ${VERSIONED} with no changeset, so this releases a patch`,
    });
  },
);

it("counts every file as landed when no commit has versioned the package yet", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const { outcome } = added({ changed: ["app/main.ts"], versioned: "" });

  expect(outcome).toStrictEqual({
    ok: true,
    value:
      "added .changeset/unreleased-work.md: app/main.ts landed since the first commit with no changeset, so this releases a patch",
  });
});

it.each([["-E"], ["-G"], ["ls-files"], ["--format=%s"]])(
  "fails, naming the command, when git %s fails",
  { timeout: 1000 },
  (failing) => {
    expect.hasAssertions();

    const outcome = addUnreleasedChangeset({ directory: folder({}), git: failingAt(failing) });

    expect(outcome).toStrictEqual({ ok: false, reason: `git ${failing} failed` });
  },
);
