interface Violation {
  readonly code: string;
  readonly message: string;
  readonly where: string;
}

interface RuleCount {
  readonly code: string;
  readonly count: number;
  readonly example: Violation;
}

const NONE = 0;
const ONE = 1;
const MAX_LINES = 40;
const HEADER_AND_TAIL = 2;
const VIOLATION_LINE = /^(?<where>\S+:\d+) (?<code>\S+) (?<message>.*)$/gu;

function violationOf(groups: Readonly<Record<string, string>>): Violation {
  const { code = "", message = "", where = "" } = groups;
  return { code, message, where };
}

function violationsOf(line: string): readonly Violation[] {
  const violations: Violation[] = [];
  for (const { groups } of line.matchAll(VIOLATION_LINE)) {
    violations.push(violationOf(groups ?? {}));
  }
  return violations;
}

function byCount(left: RuleCount, right: RuleCount): number {
  return right.count - left.count || left.code.localeCompare(right.code);
}

function countsOf(violations: readonly Violation[]): readonly RuleCount[] {
  const counts: RuleCount[] = [];
  for (const [code, group] of Map.groupBy(violations, (violation) => violation.code)) {
    for (const example of group.slice(NONE, ONE)) {
      counts.push({ code, count: group.length, example });
    }
  }
  return counts.toSorted(byCount);
}

function violationsWord(count: number): string {
  if (count === ONE) {
    return "1 violation";
  }
  return `${String(count)} violations`;
}

function ruleLine({ code, count, example }: RuleCount): string {
  return `  ${String(count)} ${code}, e.g. ${example.where} ${example.message}`;
}

function leftOut(count: number): readonly string[] {
  if (count === NONE) {
    return [];
  }
  return [`  ...and ${String(count)} more rules (see the full list above)`];
}

function shownOf(counts: readonly RuleCount[]): readonly RuleCount[] {
  if (counts.length < MAX_LINES) {
    return counts;
  }
  return counts.slice(NONE, MAX_LINES - HEADER_AND_TAIL);
}

function ruleSummary(lines: readonly string[]): readonly string[] {
  const violations = lines.flatMap((line) => violationsOf(line));
  if (violations.length === NONE) {
    return [];
  }
  const counts = countsOf(violations);
  const shown = shownOf(counts);
  return [
    `By rule (${violationsWord(violations.length)}; the full list is above):`,
    ...shown.map((count) => ruleLine(count)),
    ...leftOut(counts.length - shown.length),
  ];
}

export { ruleSummary };
