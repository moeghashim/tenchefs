# Scheduled messages are scheduled from storage, and post through the normal posting path

2026-11-24 (mattpocock/cookout#387, spec #386). A **Scheduled message** is a stored schedule that posts an ordinary top-level message into a channel at set times, on a cron expression or once, as the identity that created it (Matt, 2026-11-24, msg 3108, answering Q7). This extends [ADR "nudges are scheduled from storage"](0066-nudges-are-scheduled-from-storage.md).

## Decision

- **Storage is the only truth.** Each schedule is a record in both Storage adapters (memory and SQL, so SQLite and Postgres alike), with a migration and the contract suite: its channel, creator, text, exactly one of `cron` and `at`, time zone, status, `runsFrom` (the moment after which runs are due), its latest handled run, and a soft-delete stamp. When the next run falls due is never kept: it comes from the cron expression and `runsFrom`.
- **One fiber in the Scheduled messages Layer's scope**, as for nudges, reads the active schedules, handles each one's latest due run, then sleeps on Effect's Clock until the soonest next run. Creating, pausing, resuming or deleting a schedule, or any identity change, wakes it early. Only the latest due run is handled: it posts when it is under 10 minutes late and is recorded as skipped otherwise (Matt, 2026-11-24, msg 3108), so a long outage posts at most once and earlier missed runs are passed over. A restart neither loses nor repeats a run.
- **A run is one storage operation.** `runScheduledMessage` appends the message and moves `runsFrom` to the run's due moment in one transaction, and only if the schedule is still active and `runsFrom` hasn't moved since the scheduler read it, so a pause, delete or second scheduler between the read and the post can't post twice.
- **Posts go through `Messages`.** The scheduler calls `Messages.postScheduled`, which is `post` with the storage append swapped for `runScheduledMessage`: mentions, the Inbox, read receipts and the live `message` event are a typed post's. The message carries `scheduledMessage: { id, deleted }`, with `deleted` read from the schedule as it is now.
- **Not Activity.** `runScheduledMessage` isn't wrapped by the Activity recorder, so a scheduled post doesn't move its creator's last activity (Matt, 2026-11-24, msg 3171).
- **Pausing.** Paused runs are not caught up: resuming sets `runsFrom` to now. Deactivating the creator pauses its active schedules with `pausedBecause: "creator_deactivated"`, and resuming one is refused with 409 until the creator is reactivated. Deleting a channel or the creator deletes their schedules.
- **Frequency on wall-clock fields.** A cron expression must have five fields and run at most once every 30 minutes (Matt, 2026-11-24, msg 3118). The check reads the expression's own minute and hour fields as wall-clock times, so the gaps inside a day and, when it runs on two consecutive days, the gap across midnight must each be at least 30 minutes. A daylight-saving change can make one real gap shorter; the check ignores that. A day pattern that matches no date in eight years is refused as never running.

## Considered options

- **A sleeping fiber per schedule.** Rejected for the reasons ADR 0066 gives: a deploy would forget them.
- **Catch up every missed run after an outage.** Rejected: a board down for a day would post a burst of stale messages.
- **Walk real run times to check the 30-minute rule.** Rejected: walking a year of a half-hourly cron in a time zone took seconds per request.
