import { Argument, Command } from "effect/cli";
import { Effect, FileSystem } from "effect";
import { avatarLimits, avatarTooLargeRefusal } from "../../../avatars/index.ts";
import { printLine, refused } from "./output.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/call-failure.ts";
import { callServer } from "./adapters/sdk.ts";

type Local<Value> = Effect.Effect<Value, CallFailure, AgentSessionStateNeeds>;

const side = String(avatarLimits.side);

function usage(message: string): CallFailure {
  return { code: "usage", message };
}

function readAvatar(file: string): Local<Uint8Array> {
  return Effect.gen(function* readOne() {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.stat(file).pipe(Effect.mapError(() => usage(`There is no file at ${file}.`)));
    if (Number(info.size) > avatarLimits.maximumBytes) {
      return yield* Effect.fail({ ...avatarTooLargeRefusal, message: `${file}: ${avatarTooLargeRefusal.message}` });
    }
    return yield* fs.readFile(file).pipe(Effect.mapError(() => usage(`${file} can't be read.`)));
  });
}

function setOwn(file: string): Local<Readonly<Record<string, unknown>>> {
  return Effect.gen(function* setOwnAvatar() {
    const png = yield* readAvatar(file);
    const { identity: caller } = yield* callServer((client) => client.whoami());
    const { identity } = yield* callServer((client) => client.setAvatar(caller.name, png));
    return { avatar: identity.avatar, identity: identity.name };
  });
}

const avatarSetCommand = Command.make(
  "set",
  { file: Argument.String("path").pipe(Argument.withDescription(`A PNG of exactly ${side} by ${side} pixels.`)) },
  ({ file }) => Effect.matchEffect(setOwn(file), { onFailure: refused, onSuccess: printLine }),
).pipe(
  Command.withDescription(
    `Set your own avatar, the picture shown beside your name, and print one line naming it. It must already be a PNG of exactly ${side} by ${side} pixels and at most 2 MB: crop and resize it first. The old avatar is deleted.`,
  ),
);

const avatarCommand = Command.make("avatar").pipe(
  Command.withDescription("Set the picture shown beside your name."),
  Command.withSubcommands([avatarSetCommand]),
);

export { avatarCommand };
