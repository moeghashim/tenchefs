import type { Outcome } from "./tools.ts";

type Command = (args: readonly string[]) => Outcome<string>;

interface Versioning {
  readonly git: Command;
  readonly sha: string;
  readonly version: () => Outcome<string>;
}

const FULL_SHA = /^[0-9a-f]{40}$/u;

export function versionOnChosen({ git, sha, version }: Versioning): Outcome<string> {
  if (!FULL_SHA.test(sha)) {
    return { ok: false, reason: `the chosen commit "${sha}" isn't a full SHA: pass the choose job's sha output` };
  }
  const reset = git(["reset", "--hard", sha]);
  if (!reset.ok) {
    return reset;
  }
  const ran = version();
  if (!ran.ok) {
    return ran;
  }
  return { ok: true, value: `ran version on ${sha}` };
}
