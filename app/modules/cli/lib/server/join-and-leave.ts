import type { AgentSessionResponse, JoinRequest, LeaveResponse } from "../../../agent-sessions/index.ts";
import type { AgentSessionState, AgentSessionStateFile, AgentSessionStateNeeds } from "./agent-session-state.ts";
import { Array as Arr, Console, Effect, Function, Option } from "effect";
import type { CallFailure, ClientWithAgentSessionState, CredentialSource, JoinPlace } from "./adapters/sdk.ts";
import type { Registration, Wake } from "./registrations.ts";
import { answered, refused } from "./output.ts";
import { callClient, joinPlace, withClient, withJoinClient } from "./adapters/sdk.ts";
import { forgetRegistration, register, wakeOf } from "./registrations.ts";
import { joinByBrowser, joinByCode } from "./agent-join.ts";
import type { CommandFailed } from "./output.ts";
import type { IdentityName } from "../../../identities/index.ts";
import { cookoutUrl } from "../../../config/server.ts";

interface JoinFlags {
  readonly as: IdentityName;
  readonly displayName: Option.Option<string>;
  readonly force: boolean;
  readonly idleExpiry: Option.Option<string>;
  readonly sessionUrl: Option.Option<string>;
}

interface WakeAsk {
  readonly asked: boolean;
  readonly command: readonly string[];
  readonly timeoutMinutes: Option.Option<number>;
}

interface JoinOptions extends Omit<JoinFlags, "as"> {
  readonly as: Option.Option<IdentityName>;
  readonly code: Option.Option<string>;
  readonly wake: WakeAsk;
}

interface Issued {
  readonly issued: AgentSessionResponse;
  readonly source: CredentialSource;
}

interface Joining {
  readonly command: string;
  readonly issue: Effect.Effect<Issued, CallFailure, AgentSessionStateNeeds>;
}

interface JoinAnswer extends Omit<AgentSessionResponse, "agentSessionToken"> {
  readonly registration?: Registration;
  readonly source: CredentialSource;
}

const NOTHING = {};

const asMissing: CallFailure = {
  code: "usage",
  message: "`cookout join` needs --as <name>: an agent you own, or the token's own agent.",
};

const codeWithAs: CallFailure = {
  code: "usage",
  message: "`cookout join --code` joins the one agent the code was made for: leave out --as.",
};

function noHarness(command: string): CallFailure {
  return {
    code: "harness_missing",
    message:
      "No harness runs this process, so there is no harness session to join in. Run " +
      `\`${command} --print-env\` and run the \`export COOKOUT_SESSION=...\` line it prints instead.`,
  };
}

function noSessionId(harness: string, command: string): CallFailure {
  return {
    code: "harness_session_missing",
    message:
      `${harness} gives no session ID to key a join by. Run \`${command} --print-env\` and run ` +
      "the `export COOKOUT_SESSION=...` line it prints instead.",
  };
}

function alreadyJoined(identity: IdentityName): CallFailure {
  return {
    code: "already_joined",
    message:
      `This harness session has already joined as ${identity}. Run \`cookout leave\` first, or ` +
      "`cookout join --as <name> --print-env` to act as another agent from one subagent or script.",
  };
}

const codeWithDisplayName: CallFailure = {
  code: "usage",
  message:
    "`cookout join --code` joins an agent that already exists: leave out --display-name, and set one with " +
    "`cookout identity display-name <name> <display name>`.",
};

const displayNameRefusals: ReadonlySet<string> = new Set(["display_name_on_existing_agent", "display_name_required"]);

function asUsage(failure: CallFailure): CallFailure {
  if (displayNameRefusals.has(failure.code)) {
    return { code: "usage", message: failure.message };
  }
  return failure;
}

function naming(displayName: Option.Option<string>): Pick<JoinRequest, "displayName" | "requireDisplayName"> {
  return Option.match(displayName, {
    onNone: () => ({ requireDisplayName: true }),
    onSome: (name) => ({ displayName: name }),
  });
}

function joinRequest({ as, displayName, force, idleExpiry, sessionUrl }: JoinFlags): JoinRequest {
  const watched = Option.match(sessionUrl, { onNone: () => NOTHING, onSome: (url) => ({ sessionUrl: url }) });
  const named = { as, ...naming(displayName), ...watched };
  const asked = Option.match(idleExpiry, {
    onNone: () => named,
    onSome: (expiry) => ({ ...named, idleExpiry: expiry }),
  });
  if (force) {
    return { ...asked, force };
  }
  return asked;
}

function issueWithCredential(flags: JoinFlags): Effect.Effect<Issued, CallFailure, AgentSessionStateNeeds> {
  return withJoinClient((opened) =>
    Effect.map(callClient((client) => client.join(joinRequest(flags)))(opened), (issued) => ({
      issued,
      source: opened.source,
    })),
  ).pipe(Effect.mapError(asUsage));
}

function isLoginMissing(failure: CallFailure): boolean {
  return failure.code === "login_missing";
}

function issue(flags: JoinFlags): Effect.Effect<Issued, CallFailure, AgentSessionStateNeeds> {
  const byBrowser = Effect.flatMap(Effect.orDie(cookoutUrl), (url) =>
    Effect.map(
      joinByBrowser({ as: flags.as, idleExpiry: flags.idleExpiry, sessionUrl: flags.sessionUrl, url }),
      (issued) => ({
        issued,
        source: "agent-join-request" as const,
      }),
    ),
  );
  return issueWithCredential(flags).pipe(Effect.catchIf(isLoginMissing, Function.constant(byBrowser)));
}

function joinedBy(source: CredentialSource): Pick<AgentSessionState, "joinedBy"> {
  if (source === "agent-join-request") {
    return { joinedBy: source };
  }
  return NOTHING;
}

function issueAndKeep(
  joining: Joining,
  { file, url }: { readonly file: AgentSessionStateFile; readonly url: string },
): Effect.Effect<JoinAnswer, CallFailure, AgentSessionStateNeeds> {
  return Effect.gen(function* joinAs() {
    const stored = yield* file.read;
    if (Option.isSome(stored)) {
      return yield* Effect.fail(alreadyJoined(stored.value.identity));
    }
    const {
      issued: { agentSessionToken, ...answer },
      source,
    } = yield* joining.issue;
    yield* file.write({ ...answer, agentSessionToken, ...joinedBy(source), url });
    return { ...answer, source };
  });
}

const wakeUsage: CallFailure = {
  code: "usage",
  message:
    "Give a wake command (and --timeout) only with --wake, after --: cookout join --as <name> --wake -- " +
    "<wake command…>. --print-env keeps nothing to register.",
};

function nothingAsked({ asked, command, timeoutMinutes }: WakeAsk): boolean {
  return !asked && Arr.isReadonlyArrayEmpty(command) && Option.isNone(timeoutMinutes);
}

function wakeCommandOf(ask: WakeAsk): Effect.Effect<Option.Option<Wake>, CallFailure> {
  const { asked, command, timeoutMinutes } = ask;
  if (nothingAsked(ask)) {
    return Effect.succeedNone;
  }
  if (asked && Arr.isReadonlyArrayNonEmpty(command)) {
    return Effect.asSome(wakeOf({ timeoutMinutes, words: command }));
  }
  return Effect.fail(wakeUsage);
}

function joinIn(
  { file, place, url }: JoinPlace,
  joining: Joining,
  wake: Option.Option<Wake>,
): Effect.Effect<JoinAnswer, CallFailure, AgentSessionStateNeeds> {
  const { harness = "" } = place;
  if (harness === "") {
    return Effect.fail(noHarness(joining.command));
  }
  if (Option.isNone(file)) {
    return Effect.fail(noSessionId(harness, joining.command));
  }
  const joined = issueAndKeep(joining, { file: file.value, url });
  return Option.match(wake, {
    onNone: () => joined,
    onSome: (words) =>
      Effect.zipWith(joined, register({ file: file.value, place, wake: words }), (answer, registration) => ({
        ...answer,
        registration,
      })),
  });
}

function byCode(code: string, { idleExpiry, sessionUrl }: Pick<JoinFlags, "idleExpiry" | "sessionUrl">): Joining {
  const redeemed = Effect.flatMap(Effect.orDie(cookoutUrl), (url) => joinByCode({ code, idleExpiry, sessionUrl, url }));
  return {
    command: "cookout join --code <code>",
    issue: Effect.map(redeemed, (issued) => ({ issued, source: "join-code" as const })),
  };
}

function joiningByCode(code: string, { as, ...flags }: Omit<JoinOptions, "code">): Effect.Effect<Joining, CallFailure> {
  if (Option.isSome(flags.displayName)) {
    return Effect.fail(codeWithDisplayName);
  }
  return Option.match(as, {
    onNone: () => Effect.succeed(byCode(code, flags)),
    onSome: () => Effect.fail(codeWithAs),
  });
}

function joiningOf({ as, code, ...flags }: JoinOptions): Effect.Effect<Joining, CallFailure> {
  if (Option.isSome(code)) {
    return joiningByCode(code.value, { as, ...flags });
  }
  if (Option.isNone(as)) {
    return Effect.fail(asMissing);
  }
  return Effect.succeed({ command: `cookout join --as ${as.value}`, issue: issue({ as: as.value, ...flags }) });
}

function leaveAndForget(opened: ClientWithAgentSessionState): Effect.Effect<LeaveResponse, CallFailure> {
  return Effect.gen(function* leaveAgentSession() {
    if (Option.isSome(opened.joined)) {
      yield* forgetRegistration(opened.joined.value.file);
    }
    const left = yield* callClient((client) => client.leave())(opened);
    if (Option.isSome(opened.joined)) {
      yield* opened.joined.value.file.remove;
    }
    return left;
  });
}

function join(options: JoinOptions): Effect.Effect<JoinAnswer, CallFailure, AgentSessionStateNeeds> {
  return Effect.gen(function* joinAndRegister() {
    const wake = yield* wakeCommandOf(options.wake);
    const joining = yield* joiningOf(options);
    const place = yield* joinPlace;
    return yield* joinIn(place, joining, wake);
  });
}

function joinForEnvironment(options: JoinOptions): Effect.Effect<Issued, CallFailure, AgentSessionStateNeeds> {
  return Effect.flatMap(joiningOf(options), (joining) => joining.issue);
}

function printExport({ issued: { agentSessionToken } }: Issued): Effect.Effect<void> {
  return Console.log(`export COOKOUT_SESSION=${agentSessionToken}`);
}

function joinCommandRun({
  printEnv,
  ...options
}: JoinOptions & { readonly printEnv: boolean }): Effect.Effect<void, CommandFailed, AgentSessionStateNeeds> {
  if (printEnv) {
    const forEnvironment = Effect.andThen(
      Effect.filterOrFail(wakeCommandOf(options.wake), Option.isNone, () => wakeUsage),
      joinForEnvironment(options),
    );
    return Effect.matchEffect(forEnvironment, { onFailure: refused, onSuccess: printExport });
  }
  return answered(join(options));
}

const leave: Effect.Effect<LeaveResponse, CallFailure, AgentSessionStateNeeds> = withClient(leaveAndForget);

export { joinCommandRun, leave };
