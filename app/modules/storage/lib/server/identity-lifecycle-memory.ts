import type { DeleteIdentityResult } from "./identity-deletes.ts";
import { Effect } from "effect";
import type { Fails } from "./errors.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { StorageService } from "./service.ts";

interface MemoryIdentityLifecycleOptions {
  readonly deactivateIdentity: StorageService["deactivateIdentity"];
  readonly removeIdentity: (name: IdentityName, messages: number) => Fails<DeleteIdentityResult>;
  readonly countMessagesBy: StorageService["countMessagesBy"];
  readonly forgetIdentity: (name: IdentityName) => Fails<void>;
  readonly revokeAgentSessionsOf: (name: IdentityName) => Effect.Effect<void>;
  readonly dropAgentSessionsOf: (name: IdentityName) => Effect.Effect<void>;
  readonly dropWebhookCommandTokensOf: (handler: IdentityName) => void;
  readonly dropWebhookCommandsOf: (handler: IdentityName) => void;
}

type MemoryIdentityLifecycle = Pick<StorageService, "deactivateIdentity" | "deleteIdentity">;

function switchOff(options: MemoryIdentityLifecycleOptions, name: IdentityName): Effect.Effect<void> {
  return Effect.andThen(
    options.revokeAgentSessionsOf(name),
    Effect.sync(() => {
      options.dropWebhookCommandTokensOf(name);
    }),
  );
}

function memoryIdentityLifecycle(options: MemoryIdentityLifecycleOptions): MemoryIdentityLifecycle {
  return {
    deactivateIdentity: (name) =>
      Effect.tap(options.deactivateIdentity(name), (result) => {
        if (result.status !== "deactivated") {
          return Effect.void;
        }
        return switchOff(options, name);
      }),
    deleteIdentity: (name) =>
      Effect.gen(function* deleteIdentity() {
        const messages = yield* options.countMessagesBy(name);
        const result = yield* options.removeIdentity(name, messages);
        if (result.status === "deleted") {
          yield* options.forgetIdentity(name);
          yield* options.dropAgentSessionsOf(name);
          options.dropWebhookCommandsOf(name);
        }
        return result;
      }),
  };
}

export { memoryIdentityLifecycle };
