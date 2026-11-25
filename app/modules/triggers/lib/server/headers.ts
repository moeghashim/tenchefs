import { Array as Arr, Effect, Option, String as Str } from "effect";
import type { Refusal } from "../../../http/index.ts";
import type { TriggerHeader } from "../../index.ts";
import { triggerHeaderInvalid } from "../../index.ts";

const BAD_REQUEST = 400;
const MOST_HEADERS = 20;
const HTTP_TOKEN = /^[\w!#$%&'*+.^`|~-]+$/u;
const CONTROL_BUT_TAB = /[\p{Cc}--[\t]]/v;

const REFUSED: ReadonlySet<string> = new Set([
  "authorization",
  "connection",
  "content-length",
  "content-type",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function nameProblem(name: string): Option.Option<string> {
  if (!HTTP_TOKEN.test(name)) {
    return Option.some(`"${name}" isn't a header name.`);
  }
  if (REFUSED.has(Str.toLowerCase(name))) {
    return Option.some(`The board sets ${name} itself, or it means nothing past one hop, so a trigger can't.`);
  }
  return Option.none();
}

function valueProblem({ name, value }: TriggerHeader): Option.Option<string> {
  if (Str.isEmpty(value)) {
    return Option.some(`The ${name} header has no value.`);
  }
  if (CONTROL_BUT_TAB.test(value)) {
    return Option.some(`The ${name} header's value holds a line break or another control character.`);
  }
  return Option.none();
}

function problemOf(headers: readonly TriggerHeader[]): Option.Option<string> {
  if (headers.length > MOST_HEADERS) {
    return Option.some(`A trigger URL takes at most ${String(MOST_HEADERS)} extra headers.`);
  }
  const names = Arr.map(headers, ({ name }) => Str.toLowerCase(name));
  if (new Set(names).size < names.length) {
    return Option.some("Each extra header is given once.");
  }
  return Arr.findFirst(headers, (header) => Option.orElse(nameProblem(header.name), () => valueProblem(header)));
}

function checkedHeaders(asked: readonly TriggerHeader[] | undefined): Effect.Effect<readonly TriggerHeader[], Refusal> {
  const headers = asked ?? [];
  return Option.match(problemOf(headers), {
    onNone: () => Effect.succeed(Arr.map(headers, ({ name, value }) => ({ name: Str.toLowerCase(name), value }))),
    onSome: (message) => Effect.fail({ code: triggerHeaderInvalid, message, status: BAD_REQUEST }),
  });
}

export { checkedHeaders };
