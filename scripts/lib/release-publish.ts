import type { Outcome, Run } from "./tools.ts";

type Npm = (args: readonly string[]) => Outcome<Run>;

interface Deciding {
  readonly ci: boolean;
  readonly npm: Npm;
  readonly pending: readonly string[];
  readonly version: string;
}

interface ReleasePlan {
  readonly lines: readonly string[];
  readonly publish: boolean;
  readonly versionPackages: boolean;
}

const PACKAGE = "@ai-hero/cookout";
const EXIT_SUCCESS = 0;
const NOT_ON_NPM = /\bE404\b/u;
const NONE = 0;

function onNpm(npm: Npm, version: string): Outcome<boolean> {
  const viewed = npm(["view", `${PACKAGE}@${version}`, "version"]);
  if (!viewed.ok) {
    return viewed;
  }
  const { status, stderr, stdout } = viewed.value;
  if (status === EXIT_SUCCESS) {
    return { ok: true, value: stdout.trim() === version };
  }
  if (NOT_ON_NPM.test(stderr)) {
    return { ok: true, value: false };
  }
  return { ok: false, reason: `npm view ${PACKAGE}@${version} failed with status ${status}: ${stderr.trim()}` };
}

function publishLine(publish: boolean, ci: boolean, version: string): string {
  if (!publish) {
    return `publish nothing to npm: ${PACKAGE}@${version} is already there`;
  }
  if (!ci) {
    return `publish nothing to npm: ${PACKAGE}@${version} isn't there, but only CI publishes`;
  }
  return `publish ${PACKAGE}@${version} to npm`;
}

function versionPackagesLine(pending: readonly string[]): string {
  if (pending.length === NONE) {
    return "leave Version Packages alone: no changesets are pending";
  }
  return `open or update the Version Packages pull request against v1 from ${pending.length} changesets`;
}

export function releasePlan({ ci, npm, pending, version }: Deciding): Outcome<ReleasePlan> {
  const published = onNpm(npm, version);
  if (!published.ok) {
    return published;
  }
  const unpublished = !published.value;
  return {
    ok: true,
    value: {
      lines: [publishLine(unpublished, ci, version), versionPackagesLine(pending)],
      publish: unpublished && ci,
      versionPackages: pending.length > NONE,
    },
  };
}
