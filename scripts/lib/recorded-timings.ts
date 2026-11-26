import { field, list, parseJson, text } from "./json.ts";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import type { FileTiming } from "./slowest-files.ts";
import type { Outcome } from "./tools.ts";
import path from "node:path";
import { tmpdir } from "node:os";

type Gh = (args: readonly string[]) => Outcome<string>;

interface Recorded {
  readonly run: string;
  readonly timings: readonly FileTiming[];
}

interface Artifact {
  readonly createdAt: string;
  readonly name: string;
  readonly run: string;
}

interface Timings {
  readonly name: string;
  readonly prefix: string;
  readonly read: (file: string) => readonly FileTiming[];
  readonly report: string;
}

const NONE = 0;

interface Asking {
  readonly gh: Gh;
  readonly recording: Timings;
  readonly run: string;
}

function textIn(json: unknown, key: string): string {
  return text(field(json, key)) ?? "";
}

function artifactOf(artifact: unknown): readonly Artifact[] {
  const run = field(field(artifact, "workflow_run"), "id");
  const [createdAt, name] = [textIn(artifact, "created_at"), textIn(artifact, "name")];
  if (field(artifact, "expired") !== false || typeof run !== "number" || createdAt === "") {
    return [];
  }
  return [{ createdAt, name, run: String(run) }];
}

function artifactsBefore(listing: string, createdAt: string): readonly Artifact[] {
  return (list(field(parseJson(listing), "artifacts")) ?? [])
    .flatMap((artifact) => artifactOf(artifact))
    .filter((artifact) => artifact.createdAt < createdAt)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function timingsIn(dir: string, recording: Timings): readonly FileTiming[] {
  return readdirSync(dir, { encoding: "utf8", recursive: true })
    .filter((file) => path.basename(file) === recording.report)
    .flatMap((file) => recording.read(path.join(dir, file)));
}

function downloaded(gh: Gh, artifacts: readonly Artifact[], recording: Timings): Outcome<readonly FileTiming[]> {
  const dir = mkdtempSync(path.join(tmpdir(), `${recording.name}-timings-`));
  try {
    for (const { name, run } of artifacts) {
      const ran = gh(["run", "download", run, "--name", name, "--dir", path.join(dir, name)]);
      if (!ran.ok) {
        return ran;
      }
    }
    return { ok: true, value: timingsIn(dir, recording) };
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

interface Newest {
  readonly createdAt: string;
  readonly run: string;
}

type Reading<Value> =
  | { readonly kind: "read"; readonly value: Value }
  | { readonly kind: "unrecorded" | "unreadable"; readonly reason: string };

function unreadable(outcome: { readonly reason: string }): Reading<never> {
  return { kind: "unreadable", reason: outcome.reason };
}

function askedAt(gh: Gh, run: string): Outcome<string> {
  const asking = gh(["api", `repos/{owner}/{repo}/actions/runs/${run}`]);
  if (!asking.ok) {
    return asking;
  }
  return { ok: true, value: textIn(parseJson(asking.value), "created_at") };
}

function newestBefore({ gh, recording, run }: Asking): Reading<Newest> {
  const createdAt = askedAt(gh, run);
  if (!createdAt.ok) {
    return unreadable(createdAt);
  }
  const listing = gh(["api", `repos/{owner}/{repo}/actions/artifacts?name=${recording.prefix}1&per_page=100`]);
  if (!listing.ok) {
    return unreadable(listing);
  }
  const found = artifactsBefore(listing.value, createdAt.value).map(
    (artifact): Reading<Newest> => ({ kind: "read", value: { createdAt: createdAt.value, run: artifact.run } }),
  );
  return (
    found[NONE] ?? { kind: "unrecorded", reason: `no Check run recorded ${recording.name} timings before run ${run}` }
  );
}

function runArtifacts({ gh, recording, run }: Asking, createdAt: string): Outcome<readonly Artifact[]> {
  const listing = gh(["api", `repos/{owner}/{repo}/actions/runs/${run}/artifacts?per_page=100`]);
  if (!listing.ok) {
    return listing;
  }
  const artifacts = artifactsBefore(listing.value, createdAt);
  return { ok: true, value: artifacts.filter((artifact) => artifact.name.startsWith(recording.prefix)) };
}

function recordedTimings(asking: Asking): Reading<Recorded> {
  const newest = newestBefore(asking);
  if (newest.kind !== "read") {
    return newest;
  }
  const artifacts = runArtifacts({ ...asking, run: newest.value.run }, newest.value.createdAt);
  if (!artifacts.ok) {
    return unreadable(artifacts);
  }
  const timings = downloaded(asking.gh, artifacts.value, asking.recording);
  if (!timings.ok) {
    return unreadable(timings);
  }
  return { kind: "read", value: { run: newest.value.run, timings: timings.value } };
}

export type { Gh, Reading, Recorded, Timings };
export { recordedTimings };
