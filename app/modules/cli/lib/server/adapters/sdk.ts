import type { AgentSessionState, AgentSessionStateFile, AgentSessionStateNeeds } from "../agent-session-state.ts";
import type { CallFailure, CallFailureCode } from "./call-failure.ts";
import type { CookoutConnection, HarnessSession } from "../../../../config/index.ts";
import { Effect, Option, Predicate } from "effect";
import { agentSessionExpired, agentSessionRevoked } from "../../../../agent-sessions/index.ts";
import { boardUrlOrEmpty, loginFor } from "../logins.ts";
import { cookoutAuth, cookoutSession, cookoutToken, harnessEnvironment } from "../../../../config/server.ts";
import { harnessIn, harnessSessionIn } from "../../../../config/index.ts";
import { loginMissing, notJoined, unknownAuth } from "./call-failure.ts";
import { noteIgnoredForProxy, throughProxy, toFailure, toFailureAt } from "./http.ts";
import type { CookoutClient } from "../../../../sdk/index.ts";
import { agentSessionStateFile } from "../agent-session-state.ts";
import { baseUrlOf } from "../../../../http/client.ts";
import { createCookoutClient } from "../../../../sdk/index.ts";

type CredentialSource =
  | "COOKOUT_TOKEN"
  | "COOKOUT_SESSION"
  | "agent session token"
  | "agent-join-request"
  | "join-code"
  | "login"
  | "proxy"
  | "none";

interface JoinedSession {
  readonly file: AgentSessionStateFile;
  readonly state: AgentSessionState;
}

interface Credential {
  readonly joined: Option.Option<JoinedSession>;
  readonly source: CredentialSource;
  readonly token: string;
}

interface ClientWithAgentSessionState {
  readonly client: CookoutClient;
  readonly connection: CookoutConnection;
  readonly joined: Option.Option<JoinedSession>;
  readonly source: CredentialSource;
}

interface CliEnvironment {
  readonly auth: string;
  readonly markers: Readonly<Record<string, string>>;
  readonly session: string;
  readonly token: string;
  readonly url: string;
}

type Call<Value> = (client: CookoutClient) => Promise<Value>;

const NOTHING = {};

function isEnded(code: CallFailureCode): boolean {
  return code === agentSessionRevoked || code === agentSessionExpired;
}

function onAgentSessionEnded({
  joined,
}: ClientWithAgentSessionState): (failure: CallFailure) => Effect.Effect<never, CallFailure> {
  return (failure) =>
    Effect.gen(function* forgetEndedAgentSession() {
      if (!isEnded(failure.code) || Option.isNone(joined)) {
        return yield* Effect.fail(failure);
      }
      yield* joined.value.file.remove;
      const rejoin = `run \`cookout join --as ${joined.value.state.identity}\` to join again`;
      return yield* Effect.fail({
        ...failure,
        message: `${failure.message} The stored agent session token was deleted; ${rejoin}.`,
      });
    });
}

const variables = Effect.orDie(
  Effect.all(
    { auth: cookoutAuth, markers: harnessEnvironment, session: cookoutSession, token: cookoutToken },
    { concurrency: 1 },
  ),
);

const cliEnvironment = Effect.zipWith(boardUrlOrEmpty, variables, (url, found): CliEnvironment => ({ ...found, url }));

function connectionFrom(
  url: string,
  { source, token }: Credential,
  harness: { readonly harness?: string },
): CookoutConnection {
  if (source === "proxy") {
    return { ...harness, url: baseUrlOf(url) };
  }
  if (token === "") {
    return { url: baseUrlOf(url) };
  }
  return { ...harness, token, url: baseUrlOf(url) };
}

const NO_CREDENTIAL: Credential = { joined: Option.none(), source: "none", token: "" };

function given(source: CredentialSource, token: string): Credential {
  return { joined: Option.none(), source, token };
}

function joinedSessionFile(
  { harness = "", sessionId }: HarnessSession,
  url: string,
): Effect.Effect<Option.Option<AgentSessionStateFile>, never, AgentSessionStateNeeds> {
  if (harness === "" || Predicate.isUndefined(sessionId)) {
    return Effect.succeedNone;
  }
  return Effect.asSome(agentSessionStateFile({ harness, sessionId, url: baseUrlOf(url) }));
}

type Found<Value = Credential> = Effect.Effect<Value, CallFailure, AgentSessionStateNeeds>;

function joinedCredential(place: HarnessSession, url: string): Found<Option.Option<Credential>> {
  return Effect.gen(function* findJoinedSession() {
    const file = yield* joinedSessionFile(place, url);
    if (Option.isNone(file)) {
      return Option.none();
    }
    const saved = yield* file.value.read;
    return Option.map(saved, (state) => ({
      joined: Option.some({ file: file.value, state }),
      source: "agent session token" as const,
      token: state.agentSessionToken,
    }));
  });
}

function loginCredential(url: string): Found {
  return Effect.map(
    loginFor(baseUrlOf(url)),
    Option.match({ onNone: () => NO_CREDENTIAL, onSome: (login) => given("login", login) }),
  );
}

function tokenOr(env: CliEnvironment, otherwise: () => Found): Found {
  if (env.token !== "") {
    return Effect.succeed(given("COOKOUT_TOKEN", env.token));
  }
  return otherwise();
}

function sessionOr(env: CliEnvironment, otherwise: () => Found): Found {
  if (env.session !== "") {
    return Effect.succeed(given("COOKOUT_SESSION", env.session));
  }
  return otherwise();
}

function joinedOrToken(env: CliEnvironment, place: HarnessSession): Found {
  if (env.url === "") {
    return tokenOr(env, () => Effect.succeed(NO_CREDENTIAL));
  }
  return Effect.flatMap(
    joinedCredential(place, env.url),
    Option.match({ onNone: () => tokenOr(env, () => Effect.fail(notJoined)), onSome: Effect.succeed }),
  );
}

function variablesOr(env: CliEnvironment, stored: (url: string) => Found): Found {
  if (env.url === "") {
    return tokenOr(env, () => sessionOr(env, () => Effect.succeed(NO_CREDENTIAL)));
  }
  return tokenOr(env, () => sessionOr(env, () => stored(env.url)));
}

function joinedIdentity(env: CliEnvironment): Found<Option.Option<string>> {
  if (env.url === "") {
    return Effect.succeedNone;
  }
  return Effect.map(joinedCredential(harnessSessionIn(env.markers), env.url), (found) =>
    Option.map(
      Option.flatMap(found, ({ joined }) => joined),
      ({ state }) => state.identity,
    ),
  );
}

function proxyCredential(env: CliEnvironment): Found {
  return Effect.flatMap(joinedIdentity(env), (joinedAs) =>
    Effect.as(noteIgnoredForProxy({ joinedAs, token: env.token }), given("proxy", "")),
  );
}

function credentialFor(env: CliEnvironment): Found {
  if (env.auth === "proxy") {
    return proxyCredential(env);
  }
  if (env.auth !== "") {
    return Effect.fail(unknownAuth);
  }
  const place = harnessSessionIn(env.markers);
  if (Predicate.isUndefined(place.harness)) {
    return variablesOr(env, loginCredential);
  }
  return sessionOr(env, () => joinedOrToken(env, place));
}

function clientFor(
  env: CliEnvironment,
  credential: Credential,
): Effect.Effect<ClientWithAgentSessionState, CallFailure> {
  const { joined, source } = credential;
  const connection = connectionFrom(env.url, credential, harnessIn(env.markers));
  return Effect.map(
    Effect.try({ catch: toFailure, try: () => createCookoutClient({ ...connection, env: NOTHING }) }),
    (client) => ({ client, connection, joined, source }),
  );
}

type Run<Value> = (client: ClientWithAgentSessionState) => Effect.Effect<Value, CallFailure>;

function runWith<Value>(env: CliEnvironment, credential: Credential, run: Run<Value>): Found<Value> {
  return Effect.scoped(
    Effect.gen(function* runWithClient() {
      yield* throughProxy;
      const opened = yield* clientFor(env, credential);
      return yield* run(opened).pipe(Effect.catch(onAgentSessionEnded(opened)));
    }),
  );
}

function withClient<Value>(run: Run<Value>): Found<Value> {
  return Effect.gen(function* callWithClient() {
    const env = yield* cliEnvironment;
    const credential = yield* credentialFor(env);
    return yield* runWith(env, credential, run);
  });
}

function joinCredentialFor(env: CliEnvironment): Found {
  return variablesOr(env, (url) =>
    Effect.filterOrFail(
      loginCredential(url),
      ({ source }) => source === "login",
      () => loginMissing,
    ),
  );
}

function withJoinClient<Value>(run: Run<Value>): Found<Value> {
  return Effect.gen(function* callWithJoinCredential() {
    const env = yield* cliEnvironment;
    const credential = yield* joinCredentialFor(env);
    return yield* runWith(env, credential, run);
  });
}

function callClient<Value>(
  call: Call<Value>,
): (opened: ClientWithAgentSessionState) => Effect.Effect<Value, CallFailure> {
  return ({ client, connection }) => Effect.tryPromise({ catch: toFailureAt(connection.url), try: () => call(client) });
}

function callServer<Value>(call: Call<Value>): Found<Value> {
  return withClient(callClient(call));
}

interface JoinPlace {
  readonly file: Option.Option<AgentSessionStateFile>;
  readonly place: HarnessSession;
  readonly url: string;
}

const joinPlace: Effect.Effect<JoinPlace, CallFailure, AgentSessionStateNeeds> = Effect.gen(function* findJoinPlace() {
  const env = yield* cliEnvironment;
  const place = harnessSessionIn(env.markers);
  const file = yield* joinedSessionFile(place, env.url);
  return { file, place, url: baseUrlOf(env.url) };
});

export {
  type Call,
  type ClientWithAgentSessionState,
  type CredentialSource,
  type JoinPlace,
  callClient,
  callServer,
  joinPlace,
  withClient,
  withJoinClient,
};
export type { CallFailure } from "./call-failure.ts";
export { toFailure } from "./http.ts";
