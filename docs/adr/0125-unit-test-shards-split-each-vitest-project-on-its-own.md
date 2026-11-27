# Unit-test shards split each Vitest project on its own

2026-11-26 (mattpocock/cookout#751, after [ADR 0124](0124-unit-test-shards-split-by-each-files-whole-cost.md)).

## Context

After ADR 0124 every `tests` shard was planned at the same recorded cost, yet shards took 83 s to 116 s (runs 45781123736 and 45781588279). The cost counts core-seconds across the whole shard, but Vitest doesn't spread one shard's files over its workers as a single pool: it runs the shard's projects one after another. A local timeline of one shard showed `postgres` from 4.0 s to 6.3 s, `server` from 6.5 s to 16.7 s, `web` from 20.0 s to 58.7 s and `web-clock` from 60.3 s to 61.0 s, with `s3` overlapping `server`. So a shard's wall time is roughly the sum, project by project, of that project's setup plus its share of the files over the workers, ending each project on its slowest file. Two shards with the same total cost but different mixes (more `server` in one, more `web` in the other) pay different setups and different tails, and the first file in each worker of a project pays that project's imports.

## Decision

- The unit split takes the Vitest projects in turn, largest recorded cost first, and gives each file of a project to the shard with the least of that project's cost so far, breaking ties by the least total (`scripts/lib/timed-shards.ts`). Each shard then gets close to a sixth of every project, so every shard pays every project's setup and runs the same mix.
- Each file's project comes from the `vitest list --json` the plan already runs (`scripts/lib/unit-shards.ts`). The browser split has one group and is unchanged.

## Consequences

The planned total per shard can differ a little more than before, by up to one file per project. A project with fewer files than shards (`s3` has two) still sets up in only some shards. No budget, timeout or shard count changes.
