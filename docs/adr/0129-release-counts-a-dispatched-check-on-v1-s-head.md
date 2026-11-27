# Release counts a dispatched Check on v1's head

2026-11-26 (mattpocock/cookout#775).

## Context

The Red v1 workflow (ADR 0128) reverts a commit, pushes the revert with its own token, and starts Check on v1 by `workflow_dispatch`, since that push starts no workflow. Release already runs when that Check completes (`workflow_run` fires for a Check run on v1 whatever started it: Check run 45785890130, dispatched, completed at 08:48:35 UTC on 2026-11-26 and Release run 45786314670 started at 08:48:38). But its choice (`scripts/release-commit.ts`) listed only Check runs whose event was `push`, so it skipped the revert as having no Check push run, and main and the deploy kept the bad commit until the next push to v1.

## Decision

- The choice lists v1's Check runs of every event. A commit is judged by its `push` runs, and v1's head also by its newest Check run when `workflow_dispatch` started it. A dispatched run on an older commit, or one older than another run on the head, doesn't count.
- Everything after the choice decides as for a push run (`scripts/lib/release-go.ts`). No schedule is added.

## Consequences

A revert, or any hand-dispatched Check on v1's head, ships as soon as its Check is green, within the gate spacing of ADR 0121. Only v1's head can be chosen by a dispatched run, so a stale dispatch on an old commit never moves main back to it.
