import {
  Effect,
  Equal,
  FileSystem,
  Option,
  Path,
  Predicate,
  Random,
  Record as Rec,
  Schema,
  String as Str,
  pipe,
} from "effect";
import { cookoutUrl, home, xdgConfigHome } from "../../../config/server.ts";
import { baseUrlOf } from "../../../http/client.ts";
import { hasPrivateMode } from "./private-mode.ts";

interface LoginFailure {
  readonly code: "cli_error" | "config_folder_missing" | "credentials_damaged" | "credentials_unsafe";
  readonly message: string;
}

type Needs = FileSystem.FileSystem | Path.Path;

const PRETTY = 2;
const PRIVATE_FOLDER = 0o700;
const PRIVATE_FILE = 0o600;

const CredentialsSchema = Schema.Struct({
  defaultBoard: Schema.optionalKey(Schema.String),
  logins: Schema.Record(Schema.String, Schema.Struct({ token: Schema.String })),
});

type Credentials = typeof CredentialsSchema.Type;

const decodeCredentials = Schema.decodeEffect(Schema.fromJsonString(CredentialsSchema));
const encodeCredentials = Schema.encodeEffect(Schema.fromJsonString(CredentialsSchema, { space: PRETTY }));
const NO_LOGINS: Credentials = { logins: {} };

interface CredentialsLocation {
  readonly file: string;
  readonly folder: string;
  readonly fs: FileSystem.FileSystem;
}

function failure(error: { readonly message: string }): LoginFailure {
  return { code: "cli_error", message: error.message };
}

function setTo(value: string): Option.Option<string> {
  return Option.liftPredicate(value, Str.isNonEmpty);
}

const currentUser: Effect.Effect<Option.Option<number>> = Effect.sync(() =>
  Option.map(Option.fromNullishOr(process.getuid), (getuid) => getuid()),
);

const noConfigFolder: LoginFailure = {
  code: "config_folder_missing",
  message: "Set HOME or XDG_CONFIG_HOME so login has a folder to keep the Login in.",
};

const locate: Effect.Effect<Option.Option<CredentialsLocation>, never, Needs> = Effect.gen(function* findCredentials() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const xdg = yield* xdgConfigHome;
  const homeFolder = yield* home;
  const base = pipe(
    setTo(xdg),
    Option.orElse(() => Option.map(setTo(homeFolder), (folder) => path.join(folder, ".config"))),
  );
  return Option.map(base, (folder) => {
    const cookoutFolder = path.join(folder, "cookout");
    return { file: path.join(cookoutFolder, "credentials"), folder: cookoutFolder, fs };
  });
}).pipe(Effect.orDie);

function unsafe(file: string): LoginFailure {
  return {
    code: "credentials_unsafe",
    message: `The credentials file ${file} must be a file only you can read (mode 600), not a symlink. Run chmod 600 on it, or log in again after deleting it.`,
  };
}

function isPrivateFile({ mode, type, uid }: FileSystem.File.Info, user: Option.Option<number>): Effect.Effect<boolean> {
  const ownedByUser = Option.isNone(user) || Equal.equals(uid, user);
  return Effect.map(
    hasPrivateMode({ mode, wanted: PRIVATE_FILE }),
    (modeIsPrivate) => type === "File" && modeIsPrivate && ownedByUser,
  );
}

function readAt({ file, fs }: CredentialsLocation): Effect.Effect<Credentials, LoginFailure> {
  return Effect.gen(function* readCredentials() {
    const exists = yield* Effect.mapError(fs.exists(file), failure);
    if (!exists) {
      return NO_LOGINS;
    }
    const info = yield* Effect.mapError(fs.lstat(file), failure);
    const user = yield* currentUser;
    const isPrivate = yield* isPrivateFile(info, user);
    if (!isPrivate) {
      return yield* Effect.fail(unsafe(file));
    }
    const text = yield* Effect.mapError(fs.readFileString(file), failure);
    return yield* Effect.mapError(decodeCredentials(text), () => ({
      code: "credentials_damaged" as const,
      message: `The credentials file ${file} is damaged. Delete it and log in again.`,
    }));
  });
}

function writeAt(
  { file, folder, fs }: CredentialsLocation,
  credentials: Credentials,
): Effect.Effect<void, LoginFailure> {
  return Effect.gen(function* writeCredentials() {
    const text = yield* Effect.orDie(encodeCredentials(credentials));
    const suffix = yield* Random.nextInt;
    const temporary = `${file}.${String(suffix)}.tmp`;
    yield* Effect.mapError(fs.makeDirectory(folder, { mode: PRIVATE_FOLDER, recursive: true }), failure);
    yield* Effect.mapError(fs.writeFileString(temporary, `${text}\n`, { flag: "wx", mode: PRIVATE_FILE }), failure);
    yield* Effect.mapError(fs.chmod(temporary, PRIVATE_FILE), failure);
    yield* Effect.mapError(fs.rename(temporary, file), failure);
  });
}

const stored: Effect.Effect<Credentials, LoginFailure, Needs> = Effect.flatMap(
  locate,
  Option.match({ onNone: () => Effect.succeed(NO_LOGINS), onSome: readAt }),
);

function loginFor(url: string): Effect.Effect<Option.Option<string>, LoginFailure, Needs> {
  return Effect.map(stored, ({ logins }) => Option.map(Rec.get(logins, url), ({ token }) => token));
}

const defaultBoard: Effect.Effect<Option.Option<string>, LoginFailure, Needs> = Effect.map(
  stored,
  ({ defaultBoard: url }) => Option.fromUndefinedOr(url),
);

const boardUrl: Effect.Effect<Option.Option<string>, LoginFailure, Needs> = Effect.flatMap(
  Effect.orDie(cookoutUrl),
  (url) =>
    Option.match(setTo(url), { onNone: () => defaultBoard, onSome: (given) => Effect.succeedSome(baseUrlOf(given)) }),
);

const boardUrlOrEmpty: Effect.Effect<string, LoginFailure, Needs> = Effect.map(
  boardUrl,
  Option.getOrElse(() => ""),
);

const located: Effect.Effect<CredentialsLocation, LoginFailure, Needs> = Effect.flatMap(locate, (found) =>
  Effect.mapError(Effect.fromOption(found), () => noConfigFolder),
);

function saveLogin({
  token,
  url,
}: {
  readonly token: string;
  readonly url: string;
}): Effect.Effect<void, LoginFailure, Needs> {
  return Effect.gen(function* keepLogin() {
    const location = yield* located;
    const { logins } = yield* readAt(location);
    yield* writeAt(location, { defaultBoard: url, logins: Rec.set(logins, url, { token }) });
  });
}

function removeLogin(url: string): Effect.Effect<void, LoginFailure, Needs> {
  return Effect.gen(function* forgetLogin() {
    const location = yield* located;
    const { defaultBoard: board, logins } = yield* readAt(location);
    const remaining = { logins: Rec.remove(logins, url) };
    if (Predicate.isUndefined(board) || board === url) {
      return yield* writeAt(location, remaining);
    }
    return yield* writeAt(location, { ...remaining, defaultBoard: board });
  });
}

export { type LoginFailure, boardUrl, boardUrlOrEmpty, loginFor, removeLogin, saveLogin };
