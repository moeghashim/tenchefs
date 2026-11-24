interface Sources {
  readonly base: string;
  readonly baseName: string;
  readonly file: string;
  readonly head: string;
}

type Listed = { readonly entries: readonly string[]; readonly found: true } | { readonly found: false };

type Kind = "close" | "end" | "open" | "split" | "text";

interface Scan {
  readonly current: string;
  readonly depth: number;
  readonly done: boolean;
  readonly entries: readonly string[];
}

const LIST_START = /\bconst (?:postgresMigrations|migrations)\b[^=]*=\s*\[/u;
const TOKEN = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[[\](){},]|[^`"'[\](){},]+/gu;
const NESTING: ReadonlyMap<string, Kind> = new Map([
  ["(", "open"],
  [")", "close"],
  ["[", "open"],
  ["]", "close"],
  ["{", "open"],
  ["}", "close"],
]);
const AT_TOP: ReadonlyMap<string, Kind> = new Map([
  [",", "split"],
  ["]", "end"],
]);
const NOT_LISTED: Listed = { found: false };
const EMPTY: Scan = { current: "", depth: 0, done: false, entries: [] };
const NOT_FOUND = -1;
const DEEPER = 1;
const OUTERMOST = 0;
const VERSION_OFFSET = 1;

function kindOf(token: string, depth: number): Kind {
  if (depth === OUTERMOST && AT_TOP.has(token)) {
    return AT_TOP.get(token) ?? "text";
  }
  return NESTING.get(token) ?? "text";
}

function finishEntry(scan: Scan, done: boolean): Scan {
  return { current: "", depth: scan.depth, done, entries: [...scan.entries, scan.current.trim()] };
}

const steps: Readonly<Record<Kind, (scan: Scan, token: string) => Scan>> = {
  close: (scan, token) => ({ ...scan, current: scan.current + token, depth: scan.depth - DEEPER }),
  end: (scan) => finishEntry(scan, true),
  open: (scan, token) => ({ ...scan, current: scan.current + token, depth: scan.depth + DEEPER }),
  split: (scan) => finishEntry(scan, false),
  text: (scan, token) => ({ ...scan, current: scan.current + token }),
};

function step(scan: Scan, token: string): Scan {
  if (scan.done) {
    return scan;
  }
  return steps[kindOf(token, scan.depth)](scan, token);
}

function scanned(tokens: readonly string[]): Scan {
  let scan = EMPTY;
  for (const token of tokens) {
    scan = step(scan, token);
  }
  return scan;
}

function listEntries(source: string): Listed {
  const start = LIST_START.exec(source);
  if (start === null) {
    return NOT_LISTED;
  }
  const [opening = ""] = start;
  const scan = scanned(source.slice(start.index + opening.length).match(TOKEN) ?? []);
  if (!scan.done) {
    return NOT_LISTED;
  }
  return { entries: scan.entries.filter((entry) => entry !== ""), found: true };
}

function firstDifference(base: readonly string[], head: readonly string[]): number {
  return base.findIndex((entry, index) => head[index] !== entry);
}

function inserted({ baseName, file }: Sources, base: readonly string[], head: readonly string[]): readonly string[] {
  const index = firstDifference(base, head);
  if (index === NOT_FOUND) {
    return [];
  }
  return [
    `${file}: the migrations list must begin with ${baseName}'s, entry for entry, but index ${index} (schema version ${index + VERSION_OFFSET}) differs: ${baseName} has ${base[index] ?? ""}, and this has ${head[index] ?? "nothing"}. Migrations apply by position, so a deployed database would skip this one. Move new migrations to the end of the list.`,
  ];
}

function migrationsInserted(sources: Sources): readonly string[] {
  const base = listEntries(sources.base);
  const head = listEntries(sources.head);
  if (!base.found || !head.found) {
    return [`${sources.file}: found no \`const migrations = [...]\` list to compare with ${sources.baseName}'s.`];
  }
  return inserted(sources, base.entries, head.entries);
}

export { migrationsInserted };
