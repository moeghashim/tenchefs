import type { CallFailure, ClientWithAgentSessionState } from "./adapters/sdk.ts";
import { Command, Flag } from "effect/cli";
import { Effect, Option, Stream } from "effect";
import type { Heard, WatchedEvent } from "./watch-connection.ts";
import { printLine, textLine } from "./watch-lines.ts";
import { quietly, source, start } from "./watch-connection.ts";
import { startUpLine, stopped, untilStopped } from "./watch-stages.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CommandFailed } from "./output.ts";
import type { Format } from "./watch-lines.ts";
import type { StopCondition } from "./watch-stages.ts";
import { withClient } from "./adapters/sdk.ts";

interface Watching {
  readonly format: Format;
  readonly stop: StopCondition;
}

function printEach(format: Format): (event: WatchedEvent) => Effect.Effect<void> {
  return (event) => printLine({ format, json: event, text: textLine(event) });
}

function printItems({
  format,
  stop,
}: Watching): (opened: ClientWithAgentSessionState) => Effect.Effect<void, CallFailure> {
  return (opened) => {
    const starting = { from: Option.none(), listening: { onRetry: quietly, opened, runner: false } };
    return Effect.scoped(
      Effect.flatMap(start(starting), (first: Stream.Stream<readonly Heard[], CallFailure>) =>
        source({ ...starting, first }).pipe(
          startUpLine({ format, opened, stop }),
          untilStopped(stop),
          Stream.runForEach(printEach(format)),
        ),
      ),
    );
  };
}

function watch(watching: Watching): Effect.Effect<void, CommandFailed, AgentSessionStateNeeds> {
  return Effect.matchEffect(withClient(printItems(watching)), {
    onFailure: stopped(watching.format),
    onSuccess: () => Effect.void,
  });
}

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Print each line as one JSON object instead: an item is its event, the start-up line is " +
      '{ "type": "unread", "count" }, a fatal error is { "error": { "code", "message" } }.',
  ),
);

const onceFlag = Flag.Boolean("once").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Exit 0 after printing the first new item, or the start-up unread line when there is one."),
);

const untilMentionFlag = Flag.Boolean("until-mention").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Print only the first new item that @-mentions this identity, or the first nudge or deactivation offer, then exit 0, or exit 0 at the start-up unread line when an unread mention, nudge or offer is waiting.",
  ),
);

const timeoutFlag = Flag.Int("timeout").pipe(
  Flag.optional,
  Flag.withDescription("Exit 2 when this many seconds pass with no item printed."),
);

function formatOf(json: boolean): Format {
  if (json) {
    return "json";
  }
  return "text";
}

export const watchCommand = Command.make(
  "watch",
  { json: jsonFlag, once: onceFlag, timeout: timeoutFlag, untilMention: untilMentionFlag },
  ({ json, once, timeout, untilMention }) =>
    watch({ format: formatOf(json), stop: { once, timeout: Option.getOrNull(timeout), untilMention } }),
).pipe(
  Command.withDescription(
    "Print one line per new inbox item as it arrives, for Claude Code's Monitor tool: " +
      "#<channel> thread:<id> @<author>: <first 120 characters> (msg <id>), and for a nudge about a quiet thread " +
      "#<channel> thread:<id> <nudge text> (nudge <id>), and for an offer to deactivate a quiet agent " +
      "<offer text> (deactivation offer <id>), after one " +
      "<n> unread, run cookout inbox line when there are unread items. Exit codes: 0 after --once (at the " +
      "unread line, or else the first item) or " +
      "--until-mention, 1 refused, 2 --timeout passed, 3 token invalid or deleted, 4 agent session token " +
      "revoked or expired (leave, or another session ran join --force), 6 replaced by another watch for the same " +
      "agent; 3, 4 and 6 print one stdout line first. A 5xx answer, a refused or reset connection and a dropped " +
      "stream, on the start-up calls too, are retried for as long as they last, after 1 s, doubling to at most 30 s, " +
      "with one stderr note each; a 4xx exits at once. " +
      "Run cookout help monitor.",
  ),
);
