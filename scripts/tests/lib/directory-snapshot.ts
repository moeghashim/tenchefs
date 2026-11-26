import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

interface SnapshotFile {
  readonly content: string;
  readonly mode: number;
  readonly relative: string;
}

interface Snapshot {
  readonly directories: readonly string[];
  readonly files: readonly SnapshotFile[];
  readonly root: string;
}

const BYTES = "latin1";

function snapshotOf(root: string): Snapshot {
  const entries = readdirSync(root, { encoding: "utf8", recursive: true });
  const directories = entries.filter((relative) => statSync(path.join(root, relative)).isDirectory());
  const files = entries
    .filter((relative) => statSync(path.join(root, relative)).isFile())
    .map((relative) => ({
      content: readFileSync(path.join(root, relative), BYTES),
      mode: statSync(path.join(root, relative)).mode,
      relative,
    }));
  return { directories, files, root };
}

interface Writing {
  readonly root: string;
  readonly snapshot: Snapshot;
}

function writeSnapshot({ root, snapshot }: Writing): void {
  for (const directory of snapshot.directories) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  for (const { content, mode, relative } of snapshot.files) {
    writeFileSync(path.join(root, relative), content, { encoding: BYTES, mode });
  }
}

const built = new Map<string, Snapshot>();

interface Building {
  readonly build: (root: string) => void;
  readonly name: string;
}

function snapshotBuilt({ build, name }: Building): Snapshot {
  const root = mkdtempSync(path.join(tmpdir(), `${name}-built-once-`));
  try {
    build(root);
    const snapshot = snapshotOf(root);
    built.set(name, snapshot);
    return snapshot;
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function builtOnce(building: Building): Snapshot {
  return built.get(building.name) ?? snapshotBuilt(building);
}

export { type Snapshot, builtOnce, writeSnapshot };
