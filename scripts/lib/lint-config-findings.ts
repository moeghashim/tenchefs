import { field, list, parseJson } from "./json.ts";

interface Finding {
  readonly subject: string;
  readonly what: string;
}

interface Sides {
  readonly base: unknown;
  readonly head: unknown;
}

interface Settings {
  readonly base: Readonly<Record<string, string>>;
  readonly head: Readonly<Record<string, string>>;
  readonly kind: string;
  readonly newRules: readonly string[];
  readonly where: string;
}

interface Override {
  readonly key: string;
  readonly rest: string;
  readonly rules: Readonly<Record<string, string>>;
}

interface Levels {
  readonly after: number;
  readonly before: number;
  readonly label: string;
}

const NONE = 0;
const OFF = 0;
const ERROR = 2;
const UNREAD = -1;
const OPTIONS_START = 1;
const LEVELS: Readonly<Record<string, number>> = { allow: 0, deny: 2, error: 2, off: 0, warn: 1 };
const NAMES: readonly string[] = ["off", "warn", "error"];
const KNOWN_KEYS = new Set(["$schema", "categories", "ignorePatterns", "jsPlugins", "overrides", "plugins", "rules"]);
const NO_OVERRIDE: Override = { key: "", rest: "{}", rules: {} };
const CANT_TELL = "and the lint-config guard can't tell whether that loosens";

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value));
}

function settingsOf(value: unknown): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(record(value)).map(([name, setting]: readonly [string, unknown]) => [name, JSON.stringify(setting)]),
  );
}

function levelNamed(level: unknown): number {
  return LEVELS[String(level)] ?? UNREAD;
}

function levelOf(setting: string): number {
  const parsed = parseJson(setting);
  const [level = parsed] = list(parsed) ?? [parsed];
  if (typeof level === "number") {
    return levelNamed(NAMES[level]);
  }
  return levelNamed(level);
}

function nameOf(level: number): string {
  return String(NAMES[level]);
}

function optionsOf(setting: string): string {
  return JSON.stringify((list(parseJson(setting)) ?? []).slice(OPTIONS_START));
}

function lowered({ after, before, label }: Levels): readonly string[] {
  if (after === OFF) {
    return [`${label} is turned off (${nameOf(before)} to off)`];
  }
  return [`${label} is downgraded (${nameOf(before)} to ${nameOf(after)})`];
}

function changedSetting(label: string, base: string, head: string): readonly string[] {
  const levels = { after: levelOf(head), before: levelOf(base), label };
  if (levels.before === UNREAD || levels.after === UNREAD) {
    return [`${label} has a level the lint-config guard can't read`];
  }
  if (levels.after < levels.before) {
    return lowered(levels);
  }
  if (optionsOf(base) !== optionsOf(head)) {
    return [`${label} changes its options, ${CANT_TELL} it`];
  }
  return [];
}

function addedSetting(settings: Settings, name: string, head: string): readonly string[] {
  const level = levelOf(head);
  if (level === ERROR || settings.newRules.includes(name)) {
    return [];
  }
  return [`${settings.where}sets ${settings.kind} ${name} to ${nameOf(level)}`];
}

function settingChanges(settings: Settings): readonly Finding[] {
  const changed = Object.entries(settings.head).flatMap(([name, head]: readonly [string, string]) => {
    const subject = JSON.stringify(name);
    const base = settings.base[name];
    if (typeof base !== "string") {
      return addedSetting(settings, name, head).map((what) => ({ subject, what }));
    }
    const label = `${settings.where}${settings.kind} ${name}`;
    return changedSetting(label, base, head).map((what) => ({ subject, what }));
  });
  const removed = Object.entries(settings.base)
    .filter(([name, base]: readonly [string, string]) => !Object.hasOwn(settings.head, name) && levelOf(base) !== OFF)
    .map(([name]: readonly [string, string]) => ({
      subject: JSON.stringify(name),
      what: `${settings.where}drops ${settings.kind} ${name}, ${CANT_TELL} it`,
    }));
  return [...changed, ...removed];
}

function rulesOf(config: unknown): Readonly<Record<string, string>> {
  return settingsOf(field(config, "rules"));
}

function overridesOf(config: unknown): readonly Override[] {
  return (list(field(config, "overrides")) ?? []).map((override) => {
    const { files, rules, ...rest } = record(override);
    return { key: JSON.stringify(files), rest: JSON.stringify(rest), rules: settingsOf(rules) };
  });
}

function newRulesOf({ base, head }: Sides): readonly string[] {
  const known = new Set(
    [rulesOf(base), ...overridesOf(base).map((override) => override.rules)].flatMap((rules) => Object.keys(rules)),
  );
  return Object.entries(rulesOf(head))
    .filter(([rule, setting]: readonly [string, string]) => levelOf(setting) === ERROR && !known.has(rule))
    .map(([rule]: readonly [string, string]) => rule);
}

function overrideRules(where: string, base: Override, head: Override): Omit<Settings, "newRules"> {
  return { base: base.rules, head: head.rules, kind: "rule", where };
}

function changedOverride(override: Override, before: readonly Override[]): readonly Finding[] {
  const matches = before.filter((candidate) => candidate.key === override.key);
  const [match = NO_OVERRIDE] = matches;
  if (matches.length === NONE) {
    return [];
  }
  const rules = settingChanges({
    ...overrideRules(`the override for ${override.key} `, match, override),
    newRules: [],
  });
  if (match.rest === override.rest) {
    return rules;
  }
  return [
    ...rules,
    { subject: "", what: `the override for ${override.key} changes more than its rules, ${CANT_TELL} it` },
  ];
}

function keysOf(overrides: readonly Override[]): readonly string[] {
  return overrides.map((override) => override.key);
}

function overrideChanges(sides: Sides): readonly Finding[] {
  const newRules = newRulesOf(sides);
  const [before, after] = [overridesOf(sides.base), overridesOf(sides.head)];
  const added = after
    .filter((override) => !keysOf(before).includes(override.key))
    .map((override) => overrideRules(`an added or widened override for ${override.key} `, NO_OVERRIDE, override));
  const removed = before
    .filter((override) => !keysOf(after).includes(override.key))
    .map((override) => overrideRules(`a removed override for ${override.key} `, override, NO_OVERRIDE));
  return [
    ...[...added, ...removed].flatMap((settings) => settingChanges({ ...settings, newRules })),
    ...after.flatMap((override) => changedOverride(override, before)),
  ];
}

function addedEntries(sides: Sides, key: string): readonly string[] {
  const before = new Set((list(field(sides.base, key)) ?? []).map((entry) => JSON.stringify(entry)));
  return (list(field(sides.head, key)) ?? [])
    .map((entry) => JSON.stringify(entry))
    .filter((entry) => !before.has(entry));
}

function entryChanges(sides: Sides): readonly Finding[] {
  const ignored = addedEntries(sides, "ignorePatterns").map((entry) => ({
    subject: entry,
    what: `ignorePatterns gains ${entry}`,
  }));
  const plugins = ["plugins", "jsPlugins"].flatMap((key) =>
    addedEntries({ base: sides.head, head: sides.base }, key).map((entry) => ({
      subject: entry,
      what: `${key} loses ${entry}`,
    })),
  );
  return [...ignored, ...plugins];
}

function otherChanges(sides: Sides): readonly Finding[] {
  const keys = new Set([...Object.keys(record(sides.base)), ...Object.keys(record(sides.head))]);
  return [...keys]
    .filter((key) => !KNOWN_KEYS.has(key))
    .filter((key) => JSON.stringify(field(sides.base, key)) !== JSON.stringify(field(sides.head, key)))
    .map((key) => ({ subject: JSON.stringify(key), what: `${key} changes, ${CANT_TELL} the config` }));
}

function oxlintFindings(sides: Sides): readonly Finding[] {
  if (Object.keys(record(sides.head)).length === NONE) {
    return [{ subject: "", what: "can't be read as a JSON object" }];
  }
  const settings: readonly Settings[] = [
    { base: rulesOf(sides.base), head: rulesOf(sides.head), kind: "rule", newRules: newRulesOf(sides), where: "" },
    {
      base: settingsOf(field(sides.base, "categories")),
      head: settingsOf(field(sides.head, "categories")),
      kind: "category",
      newRules: [],
      where: "",
    },
  ];
  return [
    ...settings.flatMap((setting) => settingChanges(setting)),
    ...overrideChanges(sides),
    ...entryChanges(sides),
    ...otherChanges(sides),
  ];
}

export { oxlintFindings };
