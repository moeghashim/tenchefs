import { Array as Arr, Duration, Effect, Option, Schedule } from "effect";
import type { ClaudeCodeInboxNeeds, FallBackReason } from "./claude-code-inbox.ts";
import { postInto, reachOf } from "./claude-code-inbox.ts";
import type { InboxItem } from "../../../sdk/index.ts";
import type { Registration } from "./registrations.ts";
import type { RunnerLog } from "./runner-log.ts";

interface Delivering {
  readonly log: RunnerLog;
  readonly registration: Registration;
  readonly unreadOf: (items: readonly InboxItem[]) => Effect.Effect<readonly InboxItem[]>;
}

type Given = readonly InboxItem[];

const ACK_WITHIN_MINUTES = 10;
const ACK_WITHIN = Duration.minutes(ACK_WITHIN_MINUTES);
const ACK_POLL = "5 seconds";

function idsOf(items: Given): readonly number[] {
  return Arr.map(items, ({ message }) => message.id);
}

function untilAcked({ unreadOf }: Delivering, given: Given): Effect.Effect<Given> {
  const unread = unreadOf(given);
  const acked = Effect.repeat(unread, { schedule: Schedule.spaced(ACK_POLL), until: Arr.isReadonlyArrayEmpty });
  return Effect.flatMap(Effect.timeoutOption(acked, ACK_WITHIN), (left) =>
    Option.match(left, { onNone: () => unread, onSome: Effect.succeed }),
  );
}

function fellBack({ log, registration }: Delivering, given: Given) {
  return (reason: FallBackReason): Effect.Effect<Given> =>
    Effect.as(log.record(registration.agent, { messages: idsOf(given), reason, type: "fell-back" }), given);
}

function afterPosting(delivering: Delivering, given: Given): Effect.Effect<Given> {
  return Effect.flatMap(untilAcked(delivering, given), (unread) => {
    if (Arr.isReadonlyArrayNonEmpty(unread)) {
      return fellBack(delivering, unread)("not-acked");
    }
    const delivered = { messages: idsOf(given), type: "delivered-live" } as const;
    return Effect.as(delivering.log.record(delivering.registration.agent, delivered), []);
  });
}

function liveFirst(delivering: Delivering) {
  const { log, registration } = delivering;
  return (given: Given): Effect.Effect<Given, never, ClaudeCodeInboxNeeds> =>
    Effect.flatMap(reachOf(registration), (reach) => {
      if (reach.kind === "none") {
        return Effect.as(log.record(registration.agent, { messages: idsOf(given), type: "woken" }), given);
      }
      if (reach.kind === "closed") {
        return fellBack(delivering, given)(reach.reason);
      }
      return Effect.matchEffect(postInto({ items: given, socket: reach.socket }), {
        onFailure: fellBack(delivering, given),
        onSuccess: () => afterPosting(delivering, given),
      });
    });
}

export { liveFirst };
