import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import type { Outcome } from "../lib/tools.ts";
import { addUnreleasedChangeset } from "../lib/release-changeset.ts";
import path from "node:path";
import { tmpdir } from "node:os";

const VERSIONED = "9999aaaa";

interface Landed {
  readonly changed: readonly string[];
  readonly pending: Readonly<Record<string, string>>;
  readonly versioned: string;
}

interface Added {
  readonly directory: string;
  readonly outcome: Outcome<string>;
}

const LANDED: Landed = { changed: [], pending: {}, versioned: VERSIONED };

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
  const { changed, pending, versioned } = { ...LANDED, ...overrides };
  const directory = folder(pending);
  const outcome = addUnreleasedChangeset({
    directory,
    git: (args): Outcome<string> => {
      if (args.includes("-G")) {
        return { ok: true, value: `${versioned}\n` };
      }
      if (args.includes("--format=%s")) {
        return { ok: true, value: "Mention suggestions put recent posters first (#666)\nDelete a message (#678)\n" };
      }
      return { ok: true, value: `${changed.join("\n")}\n` };
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

it("counts every file as landed when no commit has versioned the package yet", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const { outcome } = added({ changed: ["app/main.ts"], versioned: "" });

  expect(outcome).toStrictEqual({
    ok: true,
    value:
      "added .changeset/unreleased-work.md: app/main.ts landed since the first commit with no changeset, so this releases a patch",
  });
});

it.each([["-G"], ["ls-files"], ["--format=%s"]])(
  "fails, naming the command, when git %s fails",
  { timeout: 1000 },
  (failing) => {
    expect.hasAssertions();

    const outcome = addUnreleasedChangeset({ directory: folder({}), git: failingAt(failing) });

    expect(outcome).toStrictEqual({ ok: false, reason: `git ${failing} failed` });
  },
);
