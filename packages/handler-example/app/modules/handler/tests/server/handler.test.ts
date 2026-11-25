import { Effect, Layer, Redacted, Ref, String as Str } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { Mac, SecureRandom } from "effect/crypto";
import { expect, it } from "@effect/vitest";
import { handlerListener, handlerUrl, serveHandler } from "../../server.ts";
import { Hex } from "effect/encoding";

interface Answer {
  readonly calls: readonly unknown[];
  readonly status: number;
}

const SECRET = "a-command-secret";
const OK = 200;
const ACCEPTED = 202;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const TOO_LARGE = 413;
const ANY_FREE_PORT = { host: "127.0.0.1", port: 0 };
const ONCE = 1;
const TWICE = 2;
const OVER_TWO_MEBIBYTES = 2_097_153;

const call = {
  callId: "call-1",
  channel: "grill",
  command: "echo",
  data: { text: "hello" },
  threadId: 1,
  token: "command-token",
};
const callBody =
  '{"callId":"call-1","channel":"grill","command":"echo","data":{"text":"hello"},"threadId":1,"token":"command-token"}';
const changedBody =
  '{"callId":"call-1","channel":"grill","command":"other","data":{"text":"hello"},"threadId":1,"token":"command-token"}';
const utf8 = new TextEncoder();
const macLayer = Layer.provide(Mac.layerWebCrypto, SecureRandom.layerWebCrypto);

function signatureOf(body: string, secret: string): Effect.Effect<string> {
  return Effect.gen(function* sign() {
    const mac = yield* Mac.Mac;
    const key = yield* Mac.key(Mac.hmacSha256, utf8.encode(secret));
    const tag = yield* mac.sign(key, utf8.encode(body));
    return Hex.encode(tag);
  }).pipe(Effect.provide(macLayer), Effect.orDie);
}

function deliver(body: string, headers: Readonly<Record<string, string>>, times = ONCE): Effect.Effect<Answer> {
  return Effect.gen(function* deliverWebhook() {
    const received = yield* Ref.make<readonly unknown[]>([]);
    const server = serveHandler({
      cookoutUrl: "http://127.0.0.1:9",
      onCall: (accepted) => Ref.update(received, (before) => [...before, accepted]),
      secret: Redacted.make(SECRET),
    }).pipe(Layer.provideMerge(handlerListener(ANY_FREE_PORT)));
    const response = yield* Effect.gen(function* send() {
      const url = yield* handlerUrl;
      const post = HttpClientRequest.post(`${url}/webhook`).pipe(
        HttpClientRequest.setHeaders(headers),
        HttpClientRequest.bodyText(body, "application/json"),
        HttpClient.execute,
      );
      return yield* Effect.repeat(post, { times: times - ONCE });
    }).pipe(Effect.provide(Layer.merge(server, FetchHttpClient.layer)), Effect.scoped, Effect.orDie);
    const calls = yield* Ref.get(received);
    return { calls, status: response.status };
  });
}

function statusOf(path: string): Effect.Effect<number> {
  const server = serveHandler({
    cookoutUrl: "http://127.0.0.1:9",
    onCall: () => Effect.void,
    secret: Redacted.make(SECRET),
  }).pipe(Layer.provideMerge(handlerListener(ANY_FREE_PORT)));
  return Effect.gen(function* getPath() {
    const url = yield* handlerUrl;
    const response = yield* HttpClient.get(`${url}${path}`);
    return response.status;
  }).pipe(Effect.provide(Layer.merge(server, FetchHttpClient.layer)), Effect.scoped, Effect.orDie);
}

it.effect("the handler answers a health check with 200", () =>
  Effect.gen(function* healthCheck() {
    const status = yield* statusOf("/health");

    expect(status).toBe(OK);
  }),
);

it.effect("the handler answers any other path with 404", () =>
  Effect.gen(function* otherPath() {
    const status = yield* statusOf("/elsewhere");

    expect(status).toBe(NOT_FOUND);
  }),
);

it.effect("a webhook signed with the Webhook command's secret is accepted and handed on", () =>
  Effect.gen(function* signedCall() {
    const signature = yield* signatureOf(callBody, SECRET);
    const answer = yield* deliver(callBody, { "cookout-signature": signature });

    expect(answer).toStrictEqual({ calls: [call], status: ACCEPTED });
  }),
);

it.effect("a webhook signed with another secret gets 401 and nothing is posted", () =>
  Effect.gen(function* otherSecret() {
    const signature = yield* signatureOf(callBody, "another-secret");
    const answer = yield* deliver(callBody, { "cookout-signature": signature });

    expect(answer).toStrictEqual({ calls: [], status: UNAUTHORIZED });
  }),
);

it.effect("a webhook whose body changed after signing gets 401", () =>
  Effect.gen(function* changed() {
    const signature = yield* signatureOf(callBody, SECRET);
    const answer = yield* deliver(changedBody, { "cookout-signature": signature });

    expect(answer).toStrictEqual({ calls: [], status: UNAUTHORIZED });
  }),
);

it.effect("a webhook with no signature gets 401 and nothing is posted", () =>
  Effect.gen(function* noSignature() {
    const answer = yield* deliver(callBody, {});

    expect(answer).toStrictEqual({ calls: [], status: UNAUTHORIZED });
  }),
);

it.effect("a webhook whose signature is not hex gets 401", () =>
  Effect.gen(function* notHex() {
    const answer = yield* deliver(callBody, { "cookout-signature": "not-a-signature" });

    expect(answer).toStrictEqual({ calls: [], status: UNAUTHORIZED });
  }),
);

it.effect("a signed webhook that is not a Webhook command call gets 400 and is not handed on", () =>
  Effect.gen(function* notACall() {
    const body = '{"command":"echo"}';
    const signature = yield* signatureOf(body, SECRET);
    const answer = yield* deliver(body, { "cookout-signature": signature });

    expect(answer).toStrictEqual({ calls: [], status: BAD_REQUEST });
  }),
);

it.effect("a webhook body over 2 MiB gets 413 before its signature is checked, and is not handed on", () =>
  Effect.gen(function* tooLarge() {
    const body = `{"padding":"${Str.repeat(OVER_TWO_MEBIBYTES)("x")}"}`;
    const signature = yield* signatureOf(body, SECRET);
    const answer = yield* deliver(body, { "cookout-signature": signature });

    expect(answer).toStrictEqual({ calls: [], status: TOO_LARGE });
  }),
);

it.effect("a call ID delivered again is answered 202 again and handed on each time", () =>
  Effect.gen(function* deliveredTwice() {
    const signature = yield* signatureOf(callBody, SECRET);
    const answer = yield* deliver(callBody, { "cookout-signature": signature }, TWICE);

    expect(answer).toStrictEqual({ calls: [call, call], status: ACCEPTED });
  }),
);
