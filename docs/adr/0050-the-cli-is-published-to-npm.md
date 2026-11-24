# The CLI is published to npm

2026-11-23 (mattpocock/cookout#157). Supersedes ADR 0031's hold on publishing; its Changesets setup stands. Publishing `@ai-hero/cookout` to npm now, with the chief of staff in charge of releases, is Matt's decision of 2026-11-23, on the board. Publishing by trusted publishing (OIDC) with no npm token, because granular npm tokens are no longer an option, is also Matt's, of the same day. Making 0.1.0 the first version is the ticket's.

## Decision

- **CI publishes, from the Version Packages pull request.** `.github/workflows/release.yml` still runs `changesets/action` on push to `main`, which opens or refreshes the "Version Packages" pull request while changesets are pending. Merging that pull request leaves none, so the "Publish to npm" step runs `pnpm release` (`pnpm build && changeset publish`), which publishes only a version npm doesn't have. That step stays the only publisher: passing `publish:` to the action as well would publish twice in one run. No person or agent runs `pnpm release`, `changeset publish` or `npm publish` by hand, apart from the one first publish below.
- **Trusted publishing, no token.** The workflow grants `id-token: write`, sets up Node with `registry-url: https://registry.npmjs.org`, and upgrades npm to 11.5.1 or later, the first npm that publishes by OIDC (Node 22 ships npm 10). There is no `NPM_TOKEN` secret and no `NODE_AUTH_TOKEN`. Under OIDC npm attaches provenance by itself. pnpm 9's `publish`, which `changeset publish` calls, hands the tarball to the npm on the path, so the upgraded npm is the one that publishes.
- **The package.** `files` ships `dist`, `docs/agents.md` and `skills` (with README.md and package.json, which npm always adds); `bin` is `dist/main.js`, which starts `#!/usr/bin/env node`; `engines.node` is `>=22.18`; `publishConfig.access` is `public`, since a scoped package is restricted by default; and `repository` names `mattpocock/cookout`, which provenance checks against the workflow's repository. The pack smoke job installs the packed tarball and runs its `cookout` binary.
- **The first release is 0.1.0**, from one hand-written changeset, `.changeset/first-release.md`. `biome.json` leaves `.changeset/*.md` unformatted, as it does `SKILL.md`, because Biome's Markdown formatter turns a changeset's front matter into a heading.
- **Install docs** say `npm i -g @ai-hero/cookout` (or `npx @ai-hero/cookout`); building from a clone is the contributor path.

## Bootstrapping

npm configures a trusted publisher on a package that already exists, so the first version is published once by hand, by Matt. Then, on npmjs.com, he adds the trusted publisher for `@ai-hero/cookout`: GitHub Actions, repository `mattpocock/cookout`, workflow `release.yml`. From then on CI publishes every version. Until trust is configured, a merged Version Packages pull request fails at "Publish to npm" and publishes nothing.
