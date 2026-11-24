import { Effect, Option, Predicate } from "effect";
import type { Refusal } from "../../../http/index.ts";
import { allowLocalTriggers } from "../../../config/server.ts";
import { triggerUrlInvalid } from "../../index.ts";

const BAD_REQUEST = 400;
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

const urlInvalid: Refusal = {
  code: triggerUrlInvalid,
  message: "A trigger URL must be an https URL.",
  status: BAD_REQUEST,
};

interface Parsed {
  readonly href: string;
  readonly protocol: string;
  readonly hostname: string;
}

function parsed(asked: string): Option.Option<Parsed> {
  const url = URL.parse(asked);
  if (Predicate.isNull(url)) {
    return Option.none();
  }
  return Option.some({ hostname: url.hostname, href: url.href, protocol: url.protocol });
}

function isCallable({ hostname, protocol }: Parsed, allowLocal: boolean): boolean {
  if (protocol === "https:") {
    return true;
  }
  return allowLocal && protocol === "http:" && LOCAL_HOSTS.has(hostname);
}

function checkedUrl(asked: string): Effect.Effect<string, Refusal> {
  return Effect.gen(function* checkUrl() {
    const allowLocal = yield* Effect.orDie(allowLocalTriggers);
    const url = Option.filter(parsed(asked), (each) => isCallable(each, allowLocal));
    const callable = yield* Effect.mapError(Effect.fromOption(url), () => urlInvalid);
    return callable.href;
  });
}

export { checkedUrl };
