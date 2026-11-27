import { AGENT, ONCE, TOKEN, board } from "./trigger-board.ts";
import { Array as Arr, Effect, Layer, Option } from "effect";
import { Mac, SecureRandom } from "effect/crypto";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Hex } from "effect/encoding";
import type { WebhookCall } from "../../../webhook-fake/server.ts";

const HEADER_VALUE = "header-secret-91ad";
const schema = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" };
const utf8 = new TextEncoder();
const macLayer = Layer.provide(Mac.layerWebCrypto, SecureRandom.layerWebCrypto);

function signatureOf({ rawBody }: WebhookCall, secret: string): Effect.Effect<string> {
  return Effect.gen(function* sign() {
    const mac = yield* Mac.Mac;
    const key = yield* Mac.key(Mac.hmacSha256, utf8.encode(secret));
    const tag = yield* mac.sign(key, utf8.encode(rawBody));
    return Hex.encode(tag);
  }).pipe(Effect.provide(macLayer), Effect.orDie);
}

it.effect("on a SQLite board, a trigger stored encrypted fires with its token and its header values", () =>
  Effect.gen(function* triggerFromSealedRow() {
    const on = yield* board;
    const headers = [{ name: "x-routine-key", value: HEADER_VALUE }];
    yield* answer(() =>
      on.matt.client.setTrigger(AGENT, { headers, token: TOKEN, url: `${on.cookout.webhook.url}/fire` }),
    );
    yield* on.mention();
    const calls = yield* on.cookout.webhook.waitForCalls(ONCE);

    expect(Arr.map(calls, (call) => call.headers)).toMatchObject([
      { authorization: `Bearer ${TOKEN}`, "x-routine-key": HEADER_VALUE },
    ]);
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);

it.effect("on a SQLite board, a Webhook command's delivery is signed with the secret it stores encrypted", () =>
  Effect.gen(function* deliveryFromSealedRow() {
    const cookout = yield* TestCookout;
    const { secret } = yield* answer(() =>
      cookout.client.addCommand({ name: "deploy", schema, url: `${cookout.webhook.url}/deploy` }),
    );
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    yield* answer(() => cookout.client.callCommand("deploy", { channel: "grill", data: { branch: "main" } }));
    const call = yield* Effect.map(cookout.webhook.waitForCalls(ONCE), (calls) => Option.getOrThrow(Arr.head(calls)));

    expect(call.headers).toMatchObject({ "cookout-signature": yield* signatureOf(call, secret) });
  }).pipe(Effect.provide(testCookout({ storage: "sqlite" }))),
);
