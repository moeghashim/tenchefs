import { DEPENDENCY_CRUISER, OPT_OUTS, OXLINT_CONFIG, oxlint } from "./merge-repos.ts";

const OXLINT = ".oxlintrc.json";
const OPT_OUTS_FILE = "docs/lint-opt-outs.md";
const CRUISER = ".dependency-cruiser.cjs";

interface Change {
  readonly files: Readonly<Record<string, string>>;
  readonly name: string;
}

interface Loosening extends Change {
  readonly file: string;
  readonly hunk: string;
  readonly what: string;
}

function withRules(rules: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> {
  return { [OXLINT]: oxlint({ ...OXLINT_CONFIG, rules: { ...OXLINT_CONFIG.rules, ...rules } }) };
}

function withOverrides(...overrides: readonly unknown[]): Readonly<Record<string, string>> {
  return { [OXLINT]: oxlint({ ...OXLINT_CONFIG, overrides }) };
}

const [scriptsOverride] = OXLINT_CONFIG.overrides;

const LOOSENINGS: readonly Loosening[] = [
  {
    file: OXLINT,
    files: withRules({ "no-console": "off" }),
    hunk: '+    "no-console": "off",',
    name: "a rule turned off",
    what: "rule no-console is turned off (error to off)",
  },
  {
    file: OXLINT,
    files: withRules({ "no-console": "warn" }),
    hunk: '+    "no-console": "warn",',
    name: "a rule downgraded",
    what: "rule no-console is downgraded (error to warn)",
  },
  {
    file: OXLINT,
    files: withOverrides(scriptsOverride, { files: ["app/**"], rules: { "no-console": "off" } }),
    hunk: '+        "app/**"',
    name: "an added override",
    what: 'an added or widened override for ["app/**"] sets rule no-console to off',
  },
  {
    file: OXLINT,
    files: withOverrides({ ...scriptsOverride, files: ["scripts/**", "app/**"] }),
    hunk: '+        "app/**"',
    name: "a widened override",
    what: 'an added or widened override for ["scripts/**","app/**"] sets rule node/no-sync to off',
  },
  {
    file: OXLINT,
    files: { [OXLINT]: oxlint({ ...OXLINT_CONFIG, ignorePatterns: ["coverage/**", "app/**"] }) },
    hunk: '+    "app/**"',
    name: "an added ignorePatterns entry",
    what: 'ignorePatterns gains "app/**"',
  },
  {
    file: OXLINT,
    files: withRules({ "func-style": ["error", "expression"] }),
    hunk: '+      "expression"',
    name: "a change it can't tell tightens",
    what: "rule func-style changes its options, and the lint-config guard can't tell whether that loosens it",
  },
  {
    file: OXLINT,
    files: withRules({ "no-console": 1 }),
    hunk: '+    "no-console": 1,',
    name: "a rule downgraded by number",
    what: "rule no-console is downgraded (error to warn)",
  },
  {
    file: OXLINT,
    files: withRules({ "no-console": "loud" }),
    hunk: '+    "no-console": "loud",',
    name: "a level it can't read",
    what: "rule no-console has a level the lint-config guard can't read",
  },
  {
    file: OXLINT,
    files: {
      [OXLINT]: oxlint({
        ...OXLINT_CONFIG,
        rules: { "func-style": OXLINT_CONFIG.rules["func-style"], "no-debugger": "warn" },
      }),
    },
    hunk: '-    "no-console": "error",',
    name: "a dropped rule",
    what: "drops rule no-console, and the lint-config guard can't tell whether that loosens it",
  },
  {
    file: OXLINT,
    files: withOverrides({ ...scriptsOverride, excludeFiles: ["scripts/owner.ts"] }),
    hunk: '+        "scripts/owner.ts"',
    name: "an override that changes more than its rules",
    what: 'the override for ["scripts/**"] changes more than its rules, and the lint-config guard can\'t tell whether that loosens it',
  },
  {
    file: OXLINT,
    files: { [OXLINT]: oxlint({ ...OXLINT_CONFIG, plugins: ["eslint"] }) },
    hunk: '-    "unicorn"',
    name: "a dropped plugin",
    what: 'plugins loses "unicorn"',
  },
  {
    file: OXLINT,
    files: { [OXLINT]: oxlint({ ...OXLINT_CONFIG, options: { typeAware: false } }) },
    hunk: '+    "typeAware": false',
    name: "another setting changed",
    what: "options changes, and the lint-config guard can't tell whether that loosens the config",
  },
  {
    file: OXLINT,
    files: { [OXLINT]: "{ not json\n" },
    hunk: "+{ not json",
    name: "a config it can't read",
    what: "can't be read as a JSON object",
  },
  {
    file: OPT_OUTS_FILE,
    files: { [OPT_OUTS_FILE]: `${OPT_OUTS}- \`no-console\`, in \`app/\`: it logs.\n` },
    hunk: "+- `no-console`, in `app/`: it logs.",
    name: "an added opt-out entry",
    what: "adds an entry",
  },
  {
    file: CRUISER,
    files: { [CRUISER]: DEPENDENCY_CRUISER.replace('"error"', '"warn"') },
    hunk: '+  forbidden: [{ name: "no-circular", severity: "warn" }],',
    name: "a dependency-cruiser change",
    what: "changes, and any change to it needs approval",
  },
];

const TIGHTENINGS: readonly Change[] = [
  { files: withRules({ "local/new-rule": "error" }), name: "a new rule" },
  {
    files: {
      [OXLINT]: oxlint({
        ...OXLINT_CONFIG,
        overrides: [scriptsOverride, { files: ["app/owner.ts"], rules: { "local/new-rule": "off" } }],
        rules: { ...OXLINT_CONFIG.rules, "local/new-rule": "error" },
      }),
    },
    name: "a new rule with its own owner exemption",
  },
  { files: withRules({ "no-debugger": "error" }), name: "an error that was a warn" },
  {
    files: {
      [OXLINT]: oxlint({
        categories: OXLINT_CONFIG.categories,
        ignorePatterns: OXLINT_CONFIG.ignorePatterns,
        plugins: OXLINT_CONFIG.plugins,
        rules: OXLINT_CONFIG.rules,
      }),
    },
    name: "an override that turned a rule off, removed",
  },
];

export type { Change, Loosening };
export { LOOSENINGS, TIGHTENINGS, withRules };
