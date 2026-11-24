# Lint opt-outs

Superseded in part by ADR 0044: the list of opt-outs below is as it stood on 2026-11-23, and the live list is in [docs/lint-opt-outs.md](../lint-opt-outs.md).

2026-11-22 (mattpocock/cookout#32, part of mattpocock/cookout#17). Every Oxlint category (`nursery` included) is `"error"`, and `plugins` lists every Oxlint plugin for the stack: `effecttsgo` (Effect's official linter for TypeScript 7), `react`, `vitest` and the rest. The React Compiler and Vitest rules Oxlint lacks load as the JS plugins `react-hooks-js` and `vitest-js`. Lint runs as `effect-tsgo oxlint`, so stock `oxlint` fails on the config with `Unknown plugin: 'effecttsgo'`. A rule is off or loosened only for a contradiction: two rules that can't both pass, a rule that fights the cookout's layout, or a false positive on a library's documented API. A rule that is only harsh stays on, and what the code broke when the rulesets were turned on is in `lint-baseline.json`, so it can only go down.

Off everywhere:

- `import/no-named-export`, `import/prefer-default-export`: contradict `import/no-default-export`. Entry points use named exports.
- `import/group-exports`: one export statement per file leaves no place for the JSDoc block on each exported function that `local/no-comments` allows.
- `import/no-relative-parent-imports`: `tests/` and `lib/` reach their module's entry points through `../`. dependency-cruiser owns import shape.
- `vitest/no-importing-vitest-globals`: contradicts `vitest/prefer-importing-vitest-globals`, and `@effect/vitest` must be imported.
- `vitest/require-top-level-describe`: contradicts the `describe` ban (`vitest/max-nested-describe` at `max: 0`).
- `react/react-in-jsx-scope`: obsolete under the automatic JSX runtime (`jsx: react-jsx`).
- `unicorn/throw-new-error`: fires on Effect's `Schema.TaggedError<Self>()(...)` class factory, whose instances `effecttsgo/new-schema-class` says to build with `make`.
- `jsdoc/require-param-type`, `jsdoc/require-property-type`, `jsdoc/require-returns-type`: types live in TypeScript. `eslint-plugin-jsdoc`'s own `recommended-typescript` config turns these off.
- `no-undef`, `no-redeclare`: `tsc` checks both, and typescript-eslint's `eslint-recommended` config turns them off. `no-redeclare` also fires on a value and a type sharing a name, which is Effect's `Schema` idiom.

Off in some files:

- The 15 `effecttsgo` rules that name a global or a Node API (`async-function`, `crypto-random-uuid`, `extends-native-error`, `global-console`, `global-date`, `global-fetch`, `global-json`, `global-random`, `global-timers`, `new-promise`, `node-builtin-import`, `prefer-effect-array`, `prefer-effect-record`, `prefer-effect-string`, `process-env`), in every `app/` file outside backend code (`server.ts`, `lib/server/`, `tests/`) and in `app/web.tsx`. They point at Effect APIs, which those files may not import. The `no-restricted-globals` owners still apply there.
- `effecttsgo/node-builtin-import` and `import/no-nodejs-modules`, in the owner adapters of a Node API: `http`'s server (`node:http`), the storage SQLite adapter (`node:sqlite`) and the secrets Layer (`node:crypto`). Each one is the single owner of that API, and the other files stay banned from it by `no-restricted-imports`.
- `effecttsgo/process-env` and `node/no-process-env`, in `config`: it is the one reader of `process.env`.
- `effecttsgo/strict-effect-provide`, in `app/main.ts`, where the live Layers are provided. Also in tests: each test is its own application root and provides its own Layer.
- `vitest/require-hook`, outside `*.test.*` files: it flags every top-level statement, which is a false positive in a program entry or a script that runs at the top level. In tests it stays on and bans a top-level `layer(...)`.
- `import/no-default-export`, in `vitest.config.ts` and `tsdown.config.ts`: Vitest and tsdown read their config from the file's default export.
- `typescript/no-unsafe-*`, in `lint/**/*.js` and `*.cjs`: they are untyped JavaScript (the Oxlint JS plugin API and dependency-cruiser's config format), so every value is `any`.
- `scripts/`, `lint/`, `*.cjs`, `vitest.config.ts` and `tsdown.config.ts` are Node tooling outside `app/`, not backend code. In them the same 15 `effecttsgo` rules are off, plus `import/no-nodejs-modules` and `no-console`. The local rules in `lint/rules/` run inside Oxlint's JS plugin host, which calls plain synchronous visitors, so Effect can't be their implementation. The scripts run directly under `node` from Lefthook and CI. Written in Effect, each one would have to run its own effects, which `no-restricted-properties` bans outside `app/main.ts`. Their job is to print a report and spawn tools, as the existing override that lifts `no-restricted-globals` and `no-restricted-imports` there already says. Every other rule still applies to them, ratcheted like the rest.

Loosened:

- `func-style`: `"declaration"`, to agree with `react/function-component-definition`.
- `no-duplicate-imports`: `allowSeparateTypeImports`, to agree with `import/consistent-type-specifier-style`.
- `new-cap`: `properties: false`, since Effect's API is capitalized namespace functions (`Schema.Struct`, `Context.Service`).
- `react/jsx-filename-extension`: `.tsx` only, the extension the layout uses.
- `vitest/no-standalone-expect`: `@effect/vitest`'s `it.effect`, `it.live` and `it.prop` count as test blocks.
- `vitest/consistent-test-it`: `it`, inside and outside `describe`. `@effect/vitest` exports `it` (with `it.effect`) and no `test`. The default (`test`) has a fix that renames `it` to `test` without an import, which breaks `tsc`.
- `typescript/prefer-readonly-parameter-types`: allows `@effect/vitest`'s `Methods` and `MethodsNonLive`, the mutable `it` its callbacks receive.
- `effecttsgo/unstable-api-usage`: `allowedUnstableApis` in the `@effect/language-service` entry of `tsconfig.json` holds `@effect/vitest`, which the tests use, and the unstable Effect 4 modules the cookout is built on: `effect/cli`, `effect/http`, `effect/process`, `effect/FileSystem`, `effect/Path`, `effect/ByteSize`, `effect/Stdio` (which `cookout login --token` reads the token from, #115) and `@effect/platform-node`.
- `effecttsgo/deterministic-keys`: `keyPatterns` skips the leading `app/modules/` of a file path, so a key derives from the module path.

The first baseline is the one time counts may rise. `scripts/lint-ratchet.ts` still refuses a baseline that raises a count over the base ref, unless the rule was off in the base ref's `.oxlintrc.json`. It finds that out by asking `effect-tsgo oxlint --print-config` for the base config, which expands categories into rules. For a merge (being committed, with `MERGE_HEAD`, or checked in CI, where `HEAD` is a merge commit), a rule counts as already on only if it was on at the base and at every parent, since code from a side without the rule was never held to it. The merge into the shared branch is still checked against that branch's tip, where the rule is on. So a commit that turns a rule on can baseline that rule's violations, and from then on its counts only fall, like every rule that was already on.
