import type { ClientWithAgentSessionState } from "./adapters/sdk.ts";
import { Effect } from "effect";
import type { InboxItem } from "../../../sdk/index.ts";
import type { WakeRunFailure } from "../../../presence/index.ts";
import { callClient } from "./adapters/sdk.ts";

function failureText(failure: WakeRunFailure): string {
  if ("exitCode" in failure) {
    return `My wake run exited ${String(failure.exitCode)}.`;
  }
  return `My wake run timed out after ${String(failure.timedOutAfterMinutes)} min.`;
}

function repliedTo(asAgent: ClientWithAgentSessionState, given: readonly InboxItem[]) {
  return (failure: WakeRunFailure): Effect.Effect<void> =>
    Effect.forEach(
      given,
      ({ channel, message }) =>
        Effect.ignore(
          callClient((client) =>
            client.createMessage({ channel: channel.name, replyTo: message.id, text: failureText(failure) }),
          )(asAgent),
        ),
      { concurrency: 1, discard: true },
    );
}

interface FailedRun {
  readonly asAgent: ClientWithAgentSessionState;
  readonly failure: WakeRunFailure;
  readonly given: readonly InboxItem[];
}

function saidFailed({ asAgent, failure, given }: FailedRun): Effect.Effect<void> {
  return Effect.andThen(
    repliedTo(asAgent, given)(failure),
    Effect.ignore(callClient((client) => client.failWakeRun(failure))(asAgent)),
  );
}

export { saidFailed };
