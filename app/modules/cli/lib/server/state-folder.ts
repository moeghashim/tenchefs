import { Effect, Equal, Option, Path, String as Str, pipe } from "effect";
import { home, stateDirectory, xdgStateHome } from "../../../config/server.ts";
import type { FileSystem } from "effect";
import { hasPrivateMode } from "./private-mode.ts";

interface StateFolderFailure {
  readonly code: "cli_error" | "agent_session_state_unsafe";
  readonly message: string;
}

const PRIVATE_FOLDER = 0o700;

const currentUser: Effect.Effect<Option.Option<number>> = Effect.sync(() =>
  Option.map(Option.fromNullishOr(process.getuid), (getuid) => getuid()),
);

function failure(error: { readonly message: string }): StateFolderFailure {
  return { code: "cli_error", message: error.message };
}

function setTo(value: string): Option.Option<string> {
  return Option.liftPredicate(value, Str.isNonEmpty);
}

function stateFolder(path: Path.Path): Effect.Effect<Option.Option<string>> {
  return Effect.gen(function* findStateFolder() {
    const explicit = yield* stateDirectory;
    const xdg = yield* xdgStateHome;
    const homeFolder = yield* home;
    return pipe(
      setTo(explicit),
      Option.orElse(() => Option.map(setTo(xdg), (folder) => path.join(folder, "cookout"))),
      Option.orElse(() => Option.map(setTo(homeFolder), (folder) => path.join(folder, ".local", "state", "cookout"))),
    );
  }).pipe(Effect.orDie);
}

function unsafeFolder(folder: string): StateFolderFailure {
  return {
    code: "agent_session_state_unsafe",
    message: `The state folder ${folder} must be a folder only you can open (mode 700), not a symlink. Run chmod 700 on it, or set COOKOUT_STATE_DIR to a private folder.`,
  };
}

function isPrivateFolder(
  { mode, type, uid }: FileSystem.File.Info,
  user: Option.Option<number>,
): Effect.Effect<boolean> {
  const ownedByUser = Option.isNone(user) || Equal.equals(uid, user);
  return Effect.map(
    hasPrivateMode({ mode, wanted: PRIVATE_FOLDER }),
    (modeIsPrivate) => type === "Directory" && modeIsPrivate && ownedByUser,
  );
}

function checkFolder({
  folder,
  fs,
}: {
  readonly folder: string;
  readonly fs: FileSystem.FileSystem;
}): Effect.Effect<boolean, StateFolderFailure> {
  return Effect.gen(function* checkStateFolder() {
    const exists = yield* Effect.mapError(fs.exists(folder), failure);
    if (!exists) {
      return false;
    }
    const info = yield* Effect.mapError(fs.lstat(folder), failure);
    const user = yield* currentUser;
    const isPrivate = yield* isPrivateFolder(info, user);
    if (!isPrivate) {
      return yield* Effect.fail(unsafeFolder(folder));
    }
    return true;
  });
}

const stateFolderPath: Effect.Effect<Option.Option<string>, never, Path.Path> = Effect.flatMap(Path.Path, stateFolder);

export { type StateFolderFailure, checkFolder, failure, stateFolder, stateFolderPath };
