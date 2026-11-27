import type { ApprovalRequestDetails, ApprovalRequestKind } from "../../../logins/index.ts";
import { Context, DateTime, Effect, Predicate, String as Str } from "effect";
import { Caller } from "./auth.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { RequestOrigin } from "../../../storage/server.ts";
import { browserOn } from "./user-agent.ts";
import { isoTimeOf } from "../../../time/server.ts";

const FORBIDDEN = 403;
const NOT_FOUND = 404;

interface AddressLimitService {
  readonly admit: (address: string) => Effect.Effect<void, Refusal>;
}

class AddressLimit extends Context.Service<AddressLimit, AddressLimitService>()(
  "@ai-hero/cookout/identities/lib/server/login-support/AddressLimit",
) {}

const loginRequestNotFound: Refusal = {
  code: "login_request_not_found",
  message: "There is no such login request: it expired, was collected, or never existed. Run `cookout login` again.",
  status: NOT_FOUND,
};

const humanOnly: Refusal = {
  code: "human_only",
  message: "Only a human identity can approve a login.",
  status: FORBIDDEN,
};

const requireHuman: Effect.Effect<void, Refusal, Caller> = Effect.flatMap(Caller, ({ kind }) => {
  if (kind === "human") {
    return Effect.void;
  }
  return Effect.fail(humanOnly);
});

interface Lifetime {
  readonly createdAt: IsoTime;
  readonly expiresAt: IsoTime;
}

const now: Effect.Effect<IsoTime> = Effect.map(DateTime.now, isoTimeOf);

function lifetimeOf(seconds: number): Effect.Effect<Lifetime> {
  return Effect.map(DateTime.now, (started) => ({
    createdAt: isoTimeOf(started),
    expiresAt: isoTimeOf(DateTime.add(started, { seconds })),
  }));
}

const USER_AGENT_LIMIT = 500;
const START = 0;
const BROWSER = "Mozilla/";

interface Sent {
  readonly clientIp: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

function requestOriginOf({ clientIp, headers }: Sent): RequestOrigin {
  const sent = headers["user-agent"];
  if (Predicate.isUndefined(sent) || Str.isEmpty(sent)) {
    return { clientIp };
  }
  return { clientIp, userAgent: Str.slice(START, USER_AGENT_LIMIT)(sent) };
}

interface Started extends RequestOrigin {
  readonly host: string;
  readonly createdAt: IsoTime;
}

function kindOf(userAgent: string | undefined): Exclude<ApprovalRequestKind, "agent_join"> {
  if (Predicate.isString(userAgent) && Str.startsWith(BROWSER)(userAgent)) {
    return "browser";
  }
  return "terminal";
}

function whereOf({ host, userAgent }: Started): string {
  if (Predicate.isUndefined(userAgent) || kindOf(userAgent) === "terminal") {
    return host;
  }
  return browserOn(userAgent);
}

function loginRequestDetails(started: Started): ApprovalRequestDetails {
  const { clientIp, createdAt, userAgent } = started;
  let shown: ApprovalRequestDetails = { createdAt, kind: kindOf(userAgent), where: whereOf(started) };
  if (Predicate.isString(clientIp)) {
    shown = { ...shown, clientIp };
  }
  return shown;
}

export { AddressLimit, lifetimeOf, loginRequestDetails, loginRequestNotFound, now, requestOriginOf, requireHuman };
export { webSessionWhere } from "./user-agent.ts";
