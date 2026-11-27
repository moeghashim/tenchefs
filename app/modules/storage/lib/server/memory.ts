import { Effect, Predicate, Ref } from "effect";
import { memoryIdentityLifecycle, memoryIdentitySections } from "./identity-sections.ts";
import type { MemoryBoard } from "./service.ts";
import type { Scope } from "effect";
import { memoryAgentSessionSections } from "./agent-join-requests-memory.ts";
import { memoryChannels } from "./channels.ts";
import { memoryHealth } from "./health.ts";
import { memoryMessages } from "./messages-memory.ts";
import { memoryWebhookCommandCalls } from "./command-calls.ts";
import { memoryWebhookCommands } from "./commands.ts";
import { openMemoryState } from "./memory-state.ts";

function subscribingCreator(
  create: MemoryBoard["createChannel"],
  subscribe: MemoryBoard["subscribeChannel"],
): MemoryBoard["createChannel"] {
  return (channel, creator) =>
    Effect.tap(create(channel), (outcome) => {
      if (outcome === "name_taken" || Predicate.isUndefined(creator)) {
        return Effect.void;
      }
      return subscribe(creator, channel.name);
    });
}

function memorySealedSecrets(): Pick<MemoryBoard, "sealSecrets"> {
  const sealed = Ref.makeUnsafe(false);
  return {
    sealSecrets: Effect.map(Ref.getAndSet(sealed, true), (already) => {
      if (already) {
        return "unchanged" as const;
      }
      return "sealed" as const;
    }),
  };
}

export const openMemoryStorage: Effect.Effect<MemoryBoard, never, Scope.Scope> = Effect.map(
  openMemoryState,
  (state) => {
    const { forgetChannel: dropChannel, ...channels } = memoryChannels(state);
    const { findIdentity, placeHandler, removeIdentity, ...identities } = memoryIdentitySections(state);
    const { dropAgentSessionsOf, revokeAgentSessionsOf, ...agentSessions } = memoryAgentSessionSections({
      findIdentity,
      state,
    });
    const { forgetChannel, forgetIdentity, ...messages } = memoryMessages({ channels, identities, state });
    const { dropWebhookCommandTokens, dropWebhookCommandTokensOf, dropWebhookCommandsOf, dropDeliveries, ...commands } =
      memoryWebhookCommands({
        findIdentity,
        placeHandler,
        state,
      });
    return {
      ...memoryHealth(state),
      ...memorySealedSecrets(),
      ...identities,
      ...channels,
      ...messages,
      ...agentSessions,
      ...commands,
      ...memoryWebhookCommandCalls({ ...commands, ...messages }),
      ...memoryIdentityLifecycle({
        countMessagesBy: messages.countMessagesBy,
        deactivateIdentity: identities.deactivateIdentity,
        dropAgentSessionsOf,
        dropWebhookCommandTokensOf,
        dropWebhookCommandsOf,
        forgetIdentity,
        removeIdentity,
        revokeAgentSessionsOf,
      }),
      createChannel: subscribingCreator(channels.createChannel, messages.subscribeChannel),
      deleteChannel: (name) =>
        Effect.gen(function* deleteChannel() {
          const found = yield* channels.findChannel(name);
          if (Predicate.isUndefined(found)) {
            return found;
          }
          dropChannel(name);
          const { attachments, messageIds } = yield* forgetChannel(name);
          dropWebhookCommandTokens(messageIds);
          dropDeliveries(name);
          return { attachments, channel: found };
        }),
    };
  },
);
