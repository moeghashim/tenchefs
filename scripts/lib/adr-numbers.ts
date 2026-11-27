import path from "node:path";

interface Numbered {
  readonly file: string;
  readonly number: number;
}

interface Renumbering {
  readonly added: readonly string[];
  readonly v1: readonly string[];
}

const WIDTH = 4;
const START = 0;
const NONE = 0;
const ONE = 1;
const NUMBERED = new RegExp(String.raw`^\d{${WIDTH}}-.+\.md$`, "u");

function byNumber(left: Numbered, right: Numbered): number {
  return left.number - right.number;
}

function numbered(files: readonly string[]): readonly Numbered[] {
  return files
    .filter((file) => NUMBERED.test(path.basename(file)))
    .map((file): Numbered => ({ file, number: Number(path.basename(file).slice(START, WIDTH)) }))
    .toSorted(byNumber);
}

function padded(number: number): string {
  return String(number).padStart(WIDTH, "0");
}

function duplicateNumbers(files: readonly string[]): readonly string[] {
  const adrs = numbered(files);
  const numbers = [...new Set(adrs.map((adr) => adr.number))];
  return numbers.flatMap((number) => {
    const group = adrs.filter((adr) => adr.number === number).map((adr) => adr.file);
    if (group.length === ONE) {
      return [];
    }
    return [`${group.join(" and ")} share ADR number ${padded(number)}. Renumber one past the highest.`];
  });
}

function takenOnV1({ added, v1 }: Renumbering): readonly string[] {
  const theirs = numbered(v1);
  const highest = Math.max(NONE, ...theirs.map((adr) => adr.number));
  const files = new Set(theirs.map((adr) => adr.file));
  const fresh = numbered(added).filter((adr) => !files.has(adr.file));
  return fresh.flatMap((adr, index) => {
    const taken = theirs.filter((their) => their.number === adr.number).map((their) => their.file);
    if (taken.length === NONE) {
      return [];
    }
    const next = padded(highest + index + ONE);
    return [
      `${adr.file} takes ADR number ${padded(adr.number)}, which origin/v1 already gives ${taken.join(" and ")}. Renumber it to ${next}, past origin/v1's highest, and fix every link to it.`,
    ];
  });
}

export { duplicateNumbers, takenOnV1 };
