import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, rmSync } from "node:fs";
import { field, list, parseJson, text } from "./json.ts";
import type { FileTiming } from "./slowest-files.ts";
import type { Outcome } from "./tools.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

type Gh = (args: readonly string[]) => Outcome<string>;

type Download = (artifact: string, dir: string) => Outcome<string>;

interface Recorded {
  readonly run: string;
  readonly timings: readonly FileTiming[];
}

interface Artifact {
  readonly artifact: string;
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
const EXIT_SUCCESS = 0;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const ATTEMPTS = 3;
const FIRST = 1;
const RETRY_MS = 5000;
const SLEEP_SLOT = 0;
const TRANSIENT = /HTTP 5\d\d|connection reset|connection refused|unexpected EOF|i\/o timeout|ECONNRESET|ETIMEDOUT/iv;

interface Asking {
  readonly download?: Download;
  readonly gh: Gh;
  readonly recording: Timings;
  readonly run: string;
  readonly sleep?: (ms: number) => void;
}

function sleepFor(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), SLEEP_SLOT, SLEEP_SLOT, ms);
}

function textIn(json: unknown, key: string): string {
  return text(field(json, key)) ?? "";
}

function artifactOf(artifact: unknown): readonly Artifact[] {
  const [id, run] = [field(artifact, "id"), field(field(artifact, "workflow_run"), "id")];
  const [createdAt, name] = [textIn(artifact, "created_at"), textIn(artifact, "name")];
  if (field(artifact, "expired") !== false || typeof id !== "number" || typeof run !== "number" || createdAt === "") {
    return [];
  }
  return [{ artifact: String(id), createdAt, name, run: String(run) }];
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

function unzipped(zip: string, dir: string): Outcome<string> {
  const ran = spawnSync("unzip", ["-q", "-o", zip, "-d", dir], { encoding: "utf8" });
  rmSync(zip, { force: true });
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `unzip ${zip} failed: ${`${ran.stderr}${String(ran.error ?? "")}`.trim()}` };
  }
  return { ok: true, value: "" };
}

function zipFetched(cwd: string, args: readonly string[], zip: string): Outcome<string> {
  const out = openSync(zip, "w");
  try {
    const ran = spawnSync("gh", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", out, "pipe"],
      timeout: DOWNLOAD_TIMEOUT_MS,
    });
    if (ran.status !== EXIT_SUCCESS) {
      return { ok: false, reason: `gh ${args.join(" ")} failed: ${`${ran.stderr}${String(ran.error ?? "")}`.trim()}` };
    }
    return { ok: true, value: "" };
  } finally {
    closeSync(out);
  }
}

function artifactDownload(cwd: string): Download {
  return (artifact, dir) => {
    mkdirSync(dir, { recursive: true });
    const zip = path.join(dir, `${artifact}.zip`);
    const fetched = zipFetched(cwd, ["api", `repos/{owner}/{repo}/actions/artifacts/${artifact}/zip`], zip);
    if (!fetched.ok) {
      rmSync(zip, { force: true });
      return fetched;
    }
    return unzipped(zip, dir);
  };
}

interface Downloading {
  readonly fetch: () => Outcome<string>;
  readonly sleep: (ms: number) => void;
}

function withRetries({ fetch, sleep }: Downloading, attempt = FIRST): Outcome<string> {
  const ran = fetch();
  if (ran.ok || !TRANSIENT.test(ran.reason)) {
    return ran;
  }
  if (attempt >= ATTEMPTS) {
    return { ok: false, reason: `${ran.reason} (gave up after ${String(ATTEMPTS)} attempts)` };
  }
  sleep(RETRY_MS);
  return withRetries({ fetch, sleep }, attempt + FIRST);
}

function downloaded(
  { download = artifactDownload(process.cwd()), recording, sleep = sleepFor }: Asking,
  artifacts: readonly Artifact[],
): Outcome<readonly FileTiming[]> {
  const dir = mkdtempSync(path.join(tmpdir(), `${recording.name}-timings-`));
  try {
    for (const { artifact, name } of artifacts) {
      const ran = withRetries({ fetch: () => download(artifact, path.join(dir, name)), sleep });
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

function newestOfEachName(newestFirst: readonly Artifact[]): readonly Artifact[] {
  const names = new Set<string>();
  return newestFirst.filter((artifact) => {
    const seen = names.has(artifact.name);
    names.add(artifact.name);
    return !seen;
  });
}

function runArtifacts({ gh, recording, run }: Asking, createdAt: string): Outcome<readonly Artifact[]> {
  const listing = gh(["api", `repos/{owner}/{repo}/actions/runs/${run}/artifacts?per_page=100`]);
  if (!listing.ok) {
    return listing;
  }
  const artifacts = artifactsBefore(listing.value, createdAt).filter((artifact) =>
    artifact.name.startsWith(recording.prefix),
  );
  return { ok: true, value: newestOfEachName(artifacts) };
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
  const timings = downloaded(asking, artifacts.value);
  if (!timings.ok) {
    return unreadable(timings);
  }
  return { kind: "read", value: { run: newest.value.run, timings: timings.value } };
}

export type { Download, Gh, Reading, Recorded, Timings };
export { recordedTimings };
