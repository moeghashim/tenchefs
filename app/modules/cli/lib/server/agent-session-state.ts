import { AGENT_SESSIONS, checkFolder, failure, stateFolder } from "./state-folder.ts";
import { Array as Arr, Effect, FileSystem, Function, Option, Order, Path, Random, Schema, String as Str } from "effect";
import type { IdentityName, Token } from "../../../identities/index.ts";
import { identityNamePattern, isIdentityName, isToken, tokenPattern } from "../../../identities/index.ts";
import type { HarnessSessionId } from "../../../config/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { Secrets } from "../../../secrets/server.ts";
import { fileBeside } from "./file-beside.ts";

interface AgentSessionStateFailure {
  readonly code: "cli_error" | "agent_session_state_damaged" | "agent_session_state_unsafe" | "state_folder_missing";
  readonly message: string;
}

type Needs = FileSystem.FileSystem | Path.Path | Secrets;

type Codec<Value> = Schema.ConstraintCodec<Value, unknown>;

interface AgentSessionStateFile {
  readonly read: Effect.Effect<Option.Option<AgentSessionState>, AgentSessionStateFailure>;
  readonly write: (state: AgentSessionState) => Effect.Effect<void, AgentSessionStateFailure>;
  readonly beside: (suffix: string) => BesideFile;
  readonly remove: Effect.Effect<void, AgentSessionStateFailure>;
}

interface BesideFile {
  readonly exists: Effect.Effect<boolean, AgentSessionStateFailure>;
  readonly read: <Value>(
    schema: Schema.ConstraintCodec<Value, unknown>,
  ) => Effect.Effect<Option.Option<Value>, AgentSessionStateFailure>;
  readonly remove: Effect.Effect<void, AgentSessionStateFailure>;
  readonly untilGone: Effect.Effect<void>;
  readonly write: (text: string) => Effect.Effect<void, AgentSessionStateFailure>;
}

interface FileBeside<Value> {
  readonly file: AgentSessionStateFile;
  readonly value: Value;
}

interface JoinedSessionKey {
  readonly harness: string;
  readonly sessionId: HarnessSessionId;
  readonly url: string;
}

interface AgentSessionStateLocation {
  readonly base: string;
  readonly file: string;
  readonly folder: string;
  readonly fs: FileSystem.FileSystem;
}

const STATE_SUFFIX = ".json";
const KEY_START = 0;
const KEY_LENGTH = 32;
const PRETTY = 2;
const PRIVATE_FOLDER = 0o700;
const PRIVATE_FILE = 0o600;
const AGENT_JOIN_REQUEST = "agent-join-request";

const AgentSessionStateSchema = Schema.Struct({
  agentSessionToken: Schema.String.check(Schema.isPattern(tokenPattern).abort()).pipe(Schema.refine(isToken)),
  expiresAt: IsoTimeSchema,
  identity: Schema.String.check(Schema.isPattern(identityNamePattern).abort()).pipe(Schema.refine(isIdentityName)),
  issuedAt: IsoTimeSchema,
  joinedBy: Schema.optionalKey(Schema.Literal(AGENT_JOIN_REQUEST)),
  url: Schema.String,
});

interface AgentSessionState {
  readonly agentSessionToken: Token;
  readonly expiresAt: IsoTime;
  readonly identity: IdentityName;
  readonly issuedAt: IsoTime;
  readonly joinedBy?: typeof AGENT_JOIN_REQUEST;
  readonly url: string;
}

const decodeAgentSessionState = Schema.decodeEffect(Schema.fromJsonString(AgentSessionStateSchema));
const encodeAgentSessionState = Schema.encodeEffect(Schema.fromJsonString(AgentSessionStateSchema, { space: PRETTY }));

function damaged(file: string): AgentSessionStateFailure {
  return {
    code: "agent_session_state_damaged",
    message: `The agent session state file ${file} is damaged. Delete it and join again.`,
  };
}

function checkFolders({
  base,
  folder,
  fs,
}: AgentSessionStateLocation): Effect.Effect<boolean, AgentSessionStateFailure> {
  return Effect.flatMap(checkFolder({ folder: base, fs }), (baseExists) => {
    if (!baseExists) {
      return Effect.succeed(false);
    }
    return checkFolder({ folder, fs });
  });
}

function readFrom(
  location: AgentSessionStateLocation,
): Effect.Effect<Option.Option<AgentSessionState>, AgentSessionStateFailure> {
  const { file, fs } = location;
  return Effect.gen(function* readAgentSessionState() {
    const folderExists = yield* checkFolders(location);
    const exists = yield* Effect.mapError(fs.exists(file), failure);
    if (!folderExists || !exists) {
      return Option.none();
    }
    const text = yield* Effect.mapError(fs.readFileString(file), failure);
    const state = yield* Effect.mapError(decodeAgentSessionState(text), () => damaged(file));
    return Option.some(state);
  });
}

function writePrivately(
  location: AgentSessionStateLocation,
  { file, text }: { readonly file: string; readonly text: string },
): Effect.Effect<void, AgentSessionStateFailure> {
  const { folder, fs } = location;
  return Effect.gen(function* writePrivateFile() {
    const suffix = yield* Random.nextInt;
    const temporary = `${file}.${String(suffix)}.tmp`;
    yield* Effect.mapError(fs.makeDirectory(folder, { mode: PRIVATE_FOLDER, recursive: true }), failure);
    yield* checkFolders(location);
    yield* Effect.mapError(fs.writeFileString(temporary, `${text}\n`, { flag: "wx", mode: PRIVATE_FILE }), failure);
    yield* Effect.mapError(fs.chmod(temporary, PRIVATE_FILE), failure);
    yield* Effect.mapError(fs.rename(temporary, file), failure);
  });
}

function writeTo(
  location: AgentSessionStateLocation,
): (state: AgentSessionState) => Effect.Effect<void, AgentSessionStateFailure> {
  return (state) =>
    Effect.flatMap(Effect.orDie(encodeAgentSessionState(state)), (text) =>
      writePrivately(location, { file: location.file, text }),
    );
}

function withoutSuffix(file: string, suffix: string): string {
  return Str.slice(KEY_START, -suffix.length)(file);
}

function besideAt(location: AgentSessionStateLocation): (suffix: string) => BesideFile {
  return (suffix) => {
    const file = `${withoutSuffix(location.file, STATE_SUFFIX)}${suffix}`;
    const plain = fileBeside({ file, folder: location.folder, fs: location.fs });
    function read<Value>(
      schema: Schema.ConstraintCodec<Value, unknown>,
    ): Effect.Effect<Option.Option<Value>, AgentSessionStateFailure> {
      const decode = Schema.decodeEffect(Schema.fromJsonString(schema));
      return Effect.flatMap(
        plain.readText,
        Option.match({
          onNone: () => Effect.succeedNone,
          onSome: (text) =>
            Effect.mapBoth(decode(text), { onFailure: Function.constant(damaged(file)), onSuccess: Option.some }),
        }),
      );
    }
    return { ...plain, read, write: (text) => writePrivately(location, { file, text }) };
  };
}

function locationOf({
  harness,
  sessionId,
  url,
}: JoinedSessionKey): Effect.Effect<Option.Option<AgentSessionStateLocation>, never, Needs> {
  return Effect.gen(function* findAgentSessionState() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const secrets = yield* Secrets;
    const found = yield* stateFolder(path);
    const digest = yield* secrets.digest(`${harness}\n${sessionId}\n${url}`);
    const name = `${Str.slice(KEY_START, KEY_LENGTH)(digest)}${STATE_SUFFIX}`;
    return Option.map(found, (base) => {
      const folder = path.join(base, AGENT_SESSIONS);
      return { base, file: path.join(folder, name), folder, fs };
    });
  });
}

function fileAt(location: AgentSessionStateLocation): AgentSessionStateFile {
  return {
    beside: besideAt(location),
    read: readFrom(location),
    remove: Effect.mapError(location.fs.remove(location.file, { force: true }), failure),
    write: writeTo(location),
  };
}

const noFolderToWriteIn: Effect.Effect<never, AgentSessionStateFailure> = Effect.fail({
  code: "state_folder_missing",
  message: "Set HOME, XDG_STATE_HOME or COOKOUT_STATE_DIR so join has a folder to keep its agent session token in.",
});

function refuseWrite(): Effect.Effect<never, AgentSessionStateFailure> {
  return noFolderToWriteIn;
}

const nothingBeside: BesideFile = {
  exists: Effect.succeed(false),
  read: Function.constant(Effect.succeedNone),
  remove: Effect.void,
  untilGone: Effect.void,
  write: refuseWrite,
};

const noStateFolder: AgentSessionStateFile = {
  beside: Function.constant(nothingBeside),
  read: Effect.succeedNone,
  remove: Effect.void,
  write: refuseWrite,
};

function agentSessionStateFile(key: JoinedSessionKey): Effect.Effect<AgentSessionStateFile, never, Needs> {
  return Effect.map(locationOf(key), Option.match({ onNone: () => noStateFolder, onSome: fileAt }));
}

interface Listing<Value> {
  readonly decode: (text: string) => Effect.Effect<Value, Schema.SchemaError>;
  readonly location: AgentSessionStateLocation;
  readonly suffix: string;
}

function readBeside<Value>({ decode, location, suffix }: Listing<Value>) {
  return (name: string): Effect.Effect<FileBeside<Value>, AgentSessionStateFailure> => {
    const beside = `${location.folder}/${name}`;
    const file = fileAt({ ...location, file: `${withoutSuffix(beside, suffix)}${STATE_SUFFIX}` });
    return Effect.mapBoth(Effect.flatMap(location.fs.readFileString(beside), decode), {
      onFailure: () => damaged(beside),
      onSuccess: (value) => ({ file, value }),
    });
  };
}

function listBeside<Value>(
  listing: Listing<Value>,
): Effect.Effect<readonly FileBeside<Value>[], AgentSessionStateFailure> {
  const { location, suffix } = listing;
  return Effect.gen(function* listFilesBeside() {
    const exists = yield* checkFolders(location);
    if (!exists) {
      return [];
    }
    const names = yield* Effect.mapError(location.fs.readDirectory(location.folder), failure);
    const named = Arr.sort(Arr.filter(names, Str.endsWith(suffix)), Order.String);
    return yield* Effect.forEach(named, readBeside(listing), { concurrency: 1 });
  });
}

function filesBeside<Value>({
  schema,
  suffix,
}: {
  readonly schema: Schema.ConstraintCodec<Value, unknown>;
  readonly suffix: string;
}): Effect.Effect<readonly FileBeside<Value>[], AgentSessionStateFailure, Needs> {
  return Effect.gen(function* findFilesBeside() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const found = yield* stateFolder(path);
    if (Option.isNone(found)) {
      return [];
    }
    const location = { base: found.value, file: "", folder: path.join(found.value, AGENT_SESSIONS), fs };
    return yield* listBeside({ decode: Schema.decodeEffect(Schema.fromJsonString(schema)), location, suffix });
  });
}

function stateJson<Value>(schema: Codec<Value>): (text: string) => Effect.Effect<Option.Option<Value>> {
  const decode = Schema.decodeEffect(Schema.fromJsonString(schema));
  return (text) => Effect.option(decode(text));
}

function stateJsonLines<Value>(schema: Codec<Value>): (text: string) => Effect.Effect<readonly Value[]> {
  const decode = stateJson(schema);
  return (text) => {
    const lines = Arr.filter(Str.split("\n")(text), Str.isNonEmpty);
    return Effect.map(Effect.forEach(lines, decode, { concurrency: 1 }), Arr.getSomes);
  };
}

export {
  type AgentSessionState,
  filesBeside,
  stateJson,
  stateJsonLines,
  type AgentSessionStateFailure,
  type AgentSessionStateFile,
  type Needs as AgentSessionStateNeeds,
  agentSessionStateFile,
};
