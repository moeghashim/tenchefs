# A pull request's Check ends by checking its ADR numbers against the latest v1

2026-11-26 (mattpocock/cookout#827, seen in #824).

## Context

Hygiene refuses a ticket's new ADR whose number origin/v1 already gives another ADR (#732), but it runs in the Check's `static` job, against v1 as it was when the run began. #770 and #561 each added `docs/adr/0137-*` within minutes of each other: each pull request's Check was green, because each ran against a v1 without the other, and v1's hygiene check failed once both had landed, blocking every pull request until #825 renumbered one. The same nearly happened with 0135 (#772 and #770).

The issue offered two fixes: the pull request's Check also fails when its ADR number is taken on the latest v1, or ADRs get their numbers only when they land, from a landing step that renumbers to the next free number.

## Decision

- **The Check fails, as late as it can.** On a pull request into v1 the Check has one more job, `adr-numbers`, that needs every other job and runs whether they passed or failed. It checks out the merge then, so its origin/v1 is v1 as it is when the rest of the run has ended, and runs `node scripts/adr-numbers.ts`: each ADR the pull request adds (against its merge base with that v1) whose number that v1 already gives another ADR fails it, with hygiene's message naming the number to renumber to, one past v1's highest.
- The job installs nothing: the script imports only Node and `scripts/lib/adr-numbers.ts`, and the checkout leaves out file contents beyond `scripts/`. It doesn't run on pushes to v1, where hygiene's duplicate check already covers the tree.
- Hygiene keeps its own check, so a local `pnpm check` and the start of the run still catch a number taken before then.
- `gh pr checks` lists the job, so the landing steps (ADR 0127) wait on it unchanged.

## Considered options

- **Renumber at landing.** Rejected: a landing step that renames files and rewrites links is a change nobody's Check has run on, and the issue preferred a failing Check.
- **Rerun hygiene in the job.** Rejected: hygiene imports `yaml` and checks the migrations against the deploy tags, so the job would need an install and every tag, and would take longer for nothing the start of the run didn't already check.

## Consequences

- The second of two pull requests adding the same ADR number goes red before it merges, as long as the first had merged by the time the second's run ended. A worker merges as soon as its Check is green, so what's left is two runs ending within seconds of each other; then v1 goes red as before, and the fix is the renumbering this job would have asked for.
- Each pull request's Check ends one short job later than its longest job did. v1's Check runs are unchanged.
