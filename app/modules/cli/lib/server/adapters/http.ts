import { Array as Arr, Console, Effect, Option, Predicate, String as Str } from "effect";
import { EnvHttpProxyAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { CookoutError } from "../../../../sdk/index.ts";
import type { CookoutErrorCode } from "../../../../sdk/index.ts";
import type { Scope } from "effect";
import { proxyEnvironment } from "../../../../config/server.ts";

interface CallFailure {
  readonly code: CookoutErrorCode | "cli_error" | "unreachable";
  readonly message: string;
  readonly status?: number;
  readonly details?: unknown;
}

interface Unreachable {
  readonly url: string;
  readonly why: string;
}

const NETWORK_FAILURE = "fetch failed";
const NO_STATUS = 0;
const NOTHING = {};

function unreachableMessage({ url, why }: Unreachable): string {
  return `cannot reach ${url}: ${why} (check COOKOUT_URL, or HTTPS_PROXY if you are behind a proxy)`;
}

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

function messagesIn(cause: { readonly message: string }): readonly string[] {
  const nested = Arr.filter(Arr.ensure<unknown>(Reflect.get(cause, "errors")), isError);
  return [cause.message, ...Arr.flatMap(nested, messagesIn)];
}

function whyOf(cause: { readonly message: string }): string {
  return Arr.join(Arr.filter(messagesIn(cause), Str.isNonEmpty), "; ");
}

function networkFailureCause(error: unknown): Option.Option<string> {
  if (!(error instanceof TypeError) || error.message !== NETWORK_FAILURE || !isError(error.cause)) {
    return Option.none();
  }
  return Option.some(whyOf(error.cause));
}

function statusOf(status: number): { readonly status?: number } {
  if (status === NO_STATUS) {
    return NOTHING;
  }
  return { status };
}

function toFailure(error: unknown): CallFailure {
  if (!(error instanceof CookoutError)) {
    return { code: "cli_error", message: String(error) };
  }
  const { code, details, message, status } = error;
  const withStatus = { code, message, ...statusOf(status) };
  if (Predicate.isUndefined(details)) {
    return withStatus;
  }
  return { ...withStatus, details };
}

function toFailureAt(url: string): (error: unknown) => CallFailure {
  return (error) =>
    Option.match(networkFailureCause(error), {
      onNone: () => toFailure(error),
      onSome: (why): CallFailure => ({ code: "unreachable", message: unreachableMessage({ url, why }) }),
    });
}

const throughProxy: Effect.Effect<void, never, Scope.Scope> = Effect.gen(function* useProxy() {
  const settings = yield* Effect.orDie(proxyEnvironment);
  if (settings.httpProxy === "" && settings.httpsProxy === "") {
    return;
  }
  const direct = getGlobalDispatcher();
  const proxied = new EnvHttpProxyAgent(settings);
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      setGlobalDispatcher(proxied);
    }),
    () =>
      Effect.andThen(
        Effect.sync(() => {
          setGlobalDispatcher(direct);
        }),
        Effect.promise(() => proxied.destroy()),
      ),
  );
});

interface IgnoredForProxy {
  readonly joinedAs: Option.Option<string>;
  readonly token: string;
}

interface Ignored {
  readonly fix: string;
  readonly what: string;
}

function tokenIgnored(token: string): Option.Option<Ignored> {
  if (token === "") {
    return Option.none();
  }
  return Option.some({ fix: "unset COOKOUT_TOKEN", what: "COOKOUT_TOKEN" });
}

function joinedIgnored(joinedAs: Option.Option<string>): Option.Option<Ignored> {
  return Option.map(joinedAs, (identity) => ({
    fix: "run `cookout leave` without COOKOUT_AUTH",
    what: `the session joined as ${identity}`,
  }));
}

function noteIgnoredForProxy({ joinedAs, token }: IgnoredForProxy): Effect.Effect<void> {
  const ignored = Arr.getSomes([tokenIgnored(token), joinedIgnored(joinedAs)]);
  if (!Arr.isArrayNonEmpty(ignored)) {
    return Effect.void;
  }
  const what = Arr.join(
    Arr.map(ignored, (each) => each.what),
    " and ",
  );
  const fix = Arr.join(
    Arr.map(ignored, (each) => each.fix),
    " and ",
  );
  return Console.error(`${what} ignored: with COOKOUT_AUTH=proxy the proxy adds the credential; to stop this, ${fix}`);
}

export { noteIgnoredForProxy, throughProxy, toFailure, toFailureAt };
