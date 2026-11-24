import path from "node:path";

interface AdrDiff {
  readonly diff: string;
  readonly locked: ReadonlySet<string>;
  readonly originals: ReadonlyMap<string, readonly string[]>;
}

interface Change {
  readonly deleted: ReadonlySet<string>;
  readonly file: string;
  readonly lines: readonly string[];
  readonly original: ReadonlySet<string>;
}

const ADR_LINK = String.raw`\[ADR \d{4}\]\(\d{4}-[^)]+\.md\)`;
const LINK_PARTS = /\[(?<label>ADR \d{4})\]\((?<target>\d{4}-[^)]+\.md)\)/gu;
const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
const DATED_NOTE = new RegExp(
  [
    String.raw`^_?Superseded\b`,
    `^_?Confirmed by Matt on ${DATE}`,
    String.raw`^${DATE}: Matt (?:confirmed|approved)\b`,
    String.raw`: ${ADR_LINK}\.$`,
    `^${ADR_LINK} `,
  ].join("|"),
  "u",
);
const HOW =
  'Write a new ADR and add a dated line here, such as "Superseded in part on YYYY-MM-DD by [ADR NNNN](…): …".';
const FILE_START = /^diff --git a\/.+ b\//mu;
const HUNK = "@@";
const ADDED = "+";
const REMOVED = "-";
const NOT_FOUND = -1;
const AFTER_HEADER = 1;

function isDatedNote(line: string): boolean {
  return line.trim() === "" || DATED_NOTE.test(line);
}

function hunkLines(lines: readonly string[]): readonly string[] {
  const first = lines.findIndex((line) => line.startsWith(HUNK));
  if (first === NOT_FOUND) {
    return [];
  }
  return lines.slice(first).filter((line) => !line.startsWith(HUNK));
}

function contentOf(lines: readonly string[], sign: string): readonly string[] {
  return lines.filter((line) => line.startsWith(sign)).map((line) => line.slice(sign.length));
}

function isDeletion(lines: readonly string[]): boolean {
  return lines.some((line) => line.startsWith("deleted file mode"));
}

function unlinked(line: string, deleted: ReadonlySet<string>): string {
  return line.replaceAll(LINK_PARTS, (link, label: string, target: string) => {
    if (deleted.has(target)) {
      return label;
    }
    return link;
  });
}

function editsOf({ deleted, file, lines, original }: Change): readonly string[] {
  if (lines.some((line) => line.startsWith("new file mode")) || isDeletion(lines)) {
    return [];
  }
  const hunks = hunkLines(lines);
  const addedLines = new Set(contentOf(hunks, ADDED));
  const relinks = new Set(
    contentOf(hunks, REMOVED)
      .filter((line) => unlinked(line, deleted) !== line)
      .map((line) => unlinked(line, deleted))
      .filter((line) => addedLines.has(line)),
  );
  const removed = contentOf(hunks, REMOVED).filter(
    (line) => (original.has(line) || isDatedNote(line)) && !relinks.has(unlinked(line, deleted)),
  );
  const added = [...addedLines].filter((line) => !original.has(line) && !isDatedNote(line) && !relinks.has(line));
  return [
    ...removed.map((line) => `${file} is append-only, but this change removes the line "${line}". ${HOW}`),
    ...added.map(
      (line) => `${file} is append-only, but this change adds the line "${line}", which is not a dated note. ${HOW}`,
    ),
  ];
}

function adrEdits({ diff, locked, originals }: AdrDiff): readonly string[] {
  const chunks = diff
    .split(FILE_START)
    .slice(AFTER_HEADER)
    .map((chunk): readonly string[] => chunk.split("\n"));
  const deleted = new Set(chunks.filter((lines) => isDeletion(lines)).map(([file = ""]) => path.basename(file)));
  return chunks.flatMap((lines) => {
    const [file = ""] = lines;
    if (!locked.has(file)) {
      return [];
    }
    return editsOf({ deleted, file, lines: lines.slice(AFTER_HEADER), original: new Set(originals.get(file)) });
  });
}

export { adrEdits };
