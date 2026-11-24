import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { expect, it, onTestFinished } from "vitest";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const SCRIPT = path.resolve("scripts/new-cloud-worker.sh");
const PASSED = 0;
const FAILED = 1;
const REFUSED = 1;
const EXECUTABLE = 0o755;
const TOKEN = "ck_secret_token_value";
const CREATED = JSON.stringify({ identity: { name: "cookout-cloud-worker-2" }, token: TOKEN });
const NAME_TAKEN = '{"error":{"code":"identity_exists","message":"The name cookout-cloud-worker-2 is taken."}}';
const COOKOUT_CREATES = `printf '%s\\n' "$*" >> "\${0%/*}/cookout.log"\nprintf '%s\\n' '${CREATED}'`;
const COOKOUT_REFUSES = `printf '%s\\n' '${NAME_TAKEN}' >&2\nexit ${REFUSED}`;

interface Run {
  readonly bin: string;
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function binWith(fakes: Readonly<Record<string, string>>): string {
  const bin = mkdtempSync(path.join(tmpdir(), "new-cloud-worker-"));
  onTestFinished(() => {
    rmSync(bin, { force: true, recursive: true });
  });
  symlinkSync(process.execPath, path.join(bin, "node"));
  for (const [name, body] of Object.entries(fakes)) {
    const file = path.join(bin, name);
    writeFileSync(file, `#!/bin/bash\n${body}\n`);
    chmodSync(file, EXECUTABLE);
  }
  return bin;
}

function clipboard(name: string): string {
  return `IFS= read -r -d '' copied; printf '%s' "$copied" > "\${0%/*}/${name}.clipboard"`;
}

function run(fakes: Readonly<Record<string, string>>, ...args: readonly string[]): Run {
  const bin = binWith(fakes);
  const ran = spawnSync("/bin/bash", [SCRIPT, ...args], { encoding: "utf8", env: { PATH: bin } });
  return { bin, status: ran.status, stderr: ran.stderr, stdout: ran.stdout };
}

function read(bin: string, file: string): string {
  return readFileSync(path.join(bin, file), "utf8");
}

function wrote(bin: string, file: string): boolean {
  return existsSync(path.join(bin, file));
}

it("creates the worker's agent identity and copies its token to the clipboard without printing it", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const ran = run({ cookout: COOKOUT_CREATES, pbcopy: clipboard("pbcopy") }, "2");

  expect(ran.status).toBe(PASSED);
  expect(read(ran.bin, "cookout.log")).toBe(
    "identity create cookout-cloud-worker-2 --kind agent --display-name Cookout (cloud 2)\n",
  );
  expect(read(ran.bin, "pbcopy.clipboard")).toBe(TOKEN);
  expect(`${ran.stdout}${ran.stderr}`).not.toContain(TOKEN);
});

it("prints the next steps: a new session on the worker's own environment, then paste the token", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const ran = run({ cookout: COOKOUT_CREATES, pbcopy: clipboard("pbcopy") }, "2");

  expect(ran.stdout).toContain("cookout-cloud-worker-2");
  expect(ran.stdout).toContain("worker 2's own environment, not worker 1's");
  expect(ran.stdout).toContain("paste the token when it asks for the cookout credential");
});

it("uses the first clipboard tool that works, in the order pbcopy, clip.exe, wl-copy, xclip, xsel", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const ran = run(
    {
      cookout: COOKOUT_CREATES,
      "wl-copy": "exit 1",
      xclip: `[ "$*" = "-selection clipboard" ] && ${clipboard("xclip")}`,
      xsel: clipboard("xsel"),
    },
    "2",
  );

  expect(ran.status).toBe(PASSED);
  expect(read(ran.bin, "xclip.clipboard")).toBe(TOKEN);
  expect(wrote(ran.bin, "xsel.clipboard")).toBe(false);
  expect(`${ran.stdout}${ran.stderr}`).not.toContain(TOKEN);
});

it("copies with clip.exe on WSL", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const ran = run({ "clip.exe": clipboard("clip"), cookout: COOKOUT_CREATES }, "3");

  expect(ran.status).toBe(PASSED);
  expect(read(ran.bin, "clip.clipboard")).toBe(TOKEN);
});

it("with no clipboard tool, says so and prints the token only then, with a warning", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const ran = run({ cookout: COOKOUT_CREATES }, "2");

  expect(ran.status).toBe(PASSED);
  expect(ran.stderr).toContain("no clipboard tool found");
  expect(ran.stderr).toContain("shown this once");
  expect(ran.stdout).toContain(TOKEN);
});

it("passes the CLI's refusal through when the identity already exists, and copies nothing", {
  timeout: 10_000,
}, () => {
  expect.hasAssertions();

  const ran = run({ cookout: COOKOUT_REFUSES, pbcopy: clipboard("pbcopy") }, "2");

  expect(ran.status).toBe(REFUSED);
  expect(ran.stderr).toContain(NAME_TAKEN);
  expect(wrote(ran.bin, "pbcopy.clipboard")).toBe(false);
});

it.each([[], ["0"], ["-1"], ["two"], ["2.5"], ["02"], ["2", "3"]])(
  "refuses %j, which is not one positive integer, before calling cookout",
  { timeout: 10_000 },
  (...args: readonly string[]) => {
    expect.hasAssertions();

    const ran = run({ cookout: COOKOUT_CREATES, pbcopy: clipboard("pbcopy") }, ...args);

    expect(ran.status).toBe(FAILED);
    expect(ran.stderr).toContain("usage: pnpm new-cloud-worker <N>");
    expect(wrote(ran.bin, "cookout.log")).toBe(false);
  },
);

it("refuses when cookout isn't on PATH", { timeout: 10_000 }, () => {
  expect.hasAssertions();

  const ran = run({ pbcopy: clipboard("pbcopy") }, "2");

  expect(ran.status).toBe(FAILED);
  expect(ran.stderr).toContain("cookout isn't on PATH");
});
