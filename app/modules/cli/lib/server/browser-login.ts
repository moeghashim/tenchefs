import { Console, Effect, Function } from "effect";
import type { LoginCollectedResponse, LoginRequestStartedResponse, LogoutResponse } from "../../../logins/index.ts";
import { pollEvery, waitingOutRateLimits } from "./collect-poll.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { IdentityResponse } from "../../../identities/index.ts";
import { createCookoutClient } from "../../../sdk/index.ts";
import { machineName } from "./adapters/machine.ts";
import { saveLogin } from "./logins.ts";
import { toFailure } from "./adapters/sdk.ts";
import { toFailureAt } from "./adapters/http.ts";

type ApprovedLogin = Extract<LoginCollectedResponse, { readonly status: "approved" }>;

interface LoggedIn extends IdentityResponse {
  readonly url: string;
}

const NOTHING = {};

const expired: CallFailure = {
  code: "login_request_expired",
  message: "The login request expired before anyone approved it. Run `cookout login` again.",
};

function isApproved(collected: LoginCollectedResponse): collected is ApprovedLogin {
  return collected.status === "approved";
}

const failExpired = Function.constant(Effect.fail(expired));

function isGone(failure: CallFailure): boolean {
  return failure.code === "login_request_not_found";
}

interface Waiting {
  readonly client: CookoutClient;
  readonly requestId: LoginRequestStartedResponse["requestId"];
  readonly url: string;
}

function approvalOf(waiting: Waiting): Effect.Effect<ApprovedLogin, CallFailure> {
  const { client, requestId, url } = waiting;
  const collect = Effect.tryPromise({ catch: toFailureAt(url), try: () => client.collectLogin(requestId) }).pipe(
    Effect.catchIf(isGone, failExpired),
  );
  const again = Effect.suspend(() => approvalOf(waiting));
  const pollAgain = Effect.andThen(Effect.sleep(pollEvery), again);
  return Effect.filterOrElse(collect, isApproved, Function.constant(pollAgain)).pipe(waitingOutRateLimits(again));
}

function approvalPrompt(url: string, { approvalPath, expiresAt, userCode }: LoginRequestStartedResponse): string {
  return (
    `Open ${url}${approvalPath} on a device where you're logged in and type the code ${userCode}, ` +
    `or run \`cookout login approve ${userCode}\` there. The code lasts until ${expiresAt}.`
  );
}

function logInByBrowser(url: string): Effect.Effect<LoggedIn, CallFailure, AgentSessionStateNeeds> {
  return Effect.gen(function* approveInBrowser() {
    const client = yield* Effect.try({ catch: toFailure, try: () => createCookoutClient({ env: NOTHING, url }) });
    const host = yield* machineName;
    const started = yield* Effect.tryPromise({ catch: toFailureAt(url), try: () => client.startLogin({ host }) });
    yield* Console.error(approvalPrompt(url, started));
    const { identity, token } = yield* approvalOf({ client, requestId: started.requestId, url });
    yield* saveLogin({ token, url });
    return { identity, url };
  });
}

function revokedOnServer({ token, url }: { readonly token: string; readonly url: string }): Effect.Effect<boolean> {
  return Effect.tryPromise({
    catch: toFailure,
    try: (): Promise<LogoutResponse> => createCookoutClient({ env: NOTHING, token, url }).revokeLogin(),
  }).pipe(
    Effect.map(({ revoked }) => revoked),
    Effect.orElseSucceed(Function.constFalse),
  );
}

export { type LoggedIn, logInByBrowser, revokedOnServer };
