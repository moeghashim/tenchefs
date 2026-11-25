import type {
  AgentJoinRequestsEvent,
  DeactivatedQuietAgentEvent,
  DeactivationOfferEvent,
  InboxItemEvent,
  NudgeEvent,
  Reaction,
} from "../../../sdk/index.ts";
import { Array as Arr, Console, Effect, Schema, String as Str, pipe } from "effect";
import { reactionSymbols } from "../../../messages/index.ts";

type Format = "json" | "text";

const SHOWN_CHARACTERS = 120;
const toJsonLine = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

function reactedLine({ identity, reaction }: Reaction): string {
  return `@${identity} reacted with ${reactionSymbols[reaction]}`;
}

function nudgeLine({ nudge: { channel, id, parent, text } }: NudgeEvent): string {
  return `#${channel.name} thread:${String(parent.id)} ${text} (nudge ${String(id)})`;
}

function offerLine({ deactivationOffer: { id, text } }: DeactivationOfferEvent): string {
  return `${text} (deactivation offer ${String(id)})`;
}

function deactivatedLine({ deactivatedQuietAgent: { id, identity, text } }: DeactivatedQuietAgentEvent): string {
  return `${text} Run cookout identity reactivate ${identity.name} to undo it. (deactivated agent ${String(id)})`;
}

function joinRequestsLine({ agentJoinRequests }: AgentJoinRequestsEvent): string {
  return Arr.join(
    Arr.map(
      agentJoinRequests,
      ({ text, userCode }) =>
        `${text} Run cookout approve-join ${userCode} to approve it, or cookout deny-join ${userCode} to dismiss it.`,
    ),
    "\n",
  );
}

function itemLine({ item: { channel, message, newReactions = [], parent } }: InboxItemEvent): string {
  const shown = pipe(message.text, Str.replaceAll(/\s+/gu, " "), Str.takeLeft(SHOWN_CHARACTERS));
  const where = `#${channel.name} thread:${String(parent.id)}`;
  const at = `(msg ${String(message.id)})`;
  if (Arr.isReadonlyArrayNonEmpty(newReactions)) {
    return `${where} ${Arr.join(Arr.map(newReactions, reactedLine), ", ")} to your message: ${shown} ${at}`;
  }
  return `${where} @${message.author.name}: ${shown} ${at}`;
}

function textLine(
  event: InboxItemEvent | NudgeEvent | DeactivationOfferEvent | DeactivatedQuietAgentEvent | AgentJoinRequestsEvent,
): string {
  if (event.type === "agent-join-requests") {
    return joinRequestsLine(event);
  }
  if (event.type === "nudge") {
    return nudgeLine(event);
  }
  if (event.type === "deactivation-offer") {
    return offerLine(event);
  }
  if (event.type === "deactivated-quiet-agent") {
    return deactivatedLine(event);
  }
  return itemLine(event);
}

interface Line {
  readonly format: Format;
  readonly text: string;
  readonly json: unknown;
}

function printLine({ format, json, text }: Line): Effect.Effect<void> {
  if (format === "json") {
    return toJsonLine(json).pipe(Effect.orDie, Effect.flatMap(Console.log));
  }
  return Console.log(text);
}

function note(value: unknown): Effect.Effect<void> {
  return toJsonLine(value).pipe(Effect.orDie, Effect.flatMap(Console.error));
}

export { type Format, note, printLine, textLine };
