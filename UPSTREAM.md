# Upstream: cookout

tenchefs is built on [mattpocock/cookout](https://github.com/mattpocock/cookout). It is a plain git
remote, not a GitHub fork: nothing on GitHub links the two, and we pull from cookout only when we
choose to.

## Remotes

| Remote     | URL                                        | Use                         |
| ---------- | ------------------------------------------ | --------------------------- |
| `origin`   | `https://github.com/moeghashim/tenchefs`   | our repo: push here         |
| `upstream` | `https://github.com/mattpocock/cookout`    | fetch only (push disabled)  |

A fresh clone only has `origin`. To add upstream:

```sh
git remote add upstream https://github.com/mattpocock/cookout.git
git remote set-url --push upstream DISABLED
git config remote.upstream.tagOpt --no-tags   # keep cookout's tags out of ours
```

## Pulling upstream changes

```sh
git fetch upstream
git log --oneline main..upstream/main        # see what's new
git switch -c sync/upstream-$(date +%Y%m%d)
git merge upstream/main                      # resolve conflicts, run checks
git push -u origin HEAD                      # open a PR into main
```

Use merge, not rebase: our history then records which upstream commit we last took, and later
merges only replay what changed since. To take a single fix instead: `git cherry-pick <sha>`.

## Keeping the coupling loose

- Put tenchefs-only things in new files and folders where possible. Edits to cookout's files are
  fine, but each one is a place a future merge can conflict.
- We are free to diverge. If upstream rewrites something we have changed heavily, keep ours and skip
  their change; nothing forces us to stay in step.
- Upstream-specific CI is disabled in GitHub's Actions settings rather than edited out, so the
  files merge cleanly: `Deploy` (deploys to cookout's Fly app) and `Release` (publishes
  `@ai-hero/cookout` with changesets). Re-enable or replace them when tenchefs has its own deploy
  and package name (`fly.toml`, `package.json`).
