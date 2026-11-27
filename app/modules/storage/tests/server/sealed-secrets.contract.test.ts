import { Effect, String as Str } from "effect";
import type { Storage, StorageUnavailable } from "../../server.ts";
import {
  webhookCommandFixture as command,
  handlerFixture as handler,
  identityFixture as identity,
  identityName as nameOf,
  openStore,
  storageLayers,
  triggerToken,
  webhookCommandName,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const TRIAGE = nameOf("triage");
const TOKEN = triggerToken("routine-token-5d2a");
const HEADERS = [
  { name: "anthropic-version", value: "2023-06-01" },
  { name: "x-routine-key", value: "header-secret-7e10" },
];
const URL_OF = "https://routines.test/fire";
const ONE_AT_A_TIME = { concurrency: 1 } as const;

type OpenedStorage = Storage["Service"];

const ADA_HASH = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const TRIAGE_HASH = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const DEPLOY = command("deploy", { secret: "hmac_deploy-secret-31c4" });
const { secret: ROTATED } = command("deploy", { secret: "hmac_rotated-secret-a90f" });

function withSecrets(storage: OpenedStorage): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* storeSecrets() {
    yield* storage.createIdentity(identity("ada", { kind: "human" }), ADA_HASH);
    yield* storage.createIdentity(identity("triage", { owner: "ada" }), TRIAGE_HASH);
    yield* storage.setTrigger(TRIAGE, { headers: HEADERS, token: TOKEN, url: URL_OF });
    yield* storage.addWebhookCommand(DEPLOY, handler("deploy"));
    yield* storage.replaceWebhookCommandSecret(webhookCommandName("deploy"), ROTATED);
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a trigger token, its header values and a Webhook command secret read back as sent",
  ({ layer }) =>
    Effect.gen(function* secretsReadBack() {
      const { storage } = yield* openStore(layer);
      yield* withSecrets(storage);
      const trigger = yield* storage.findTrigger(TRIAGE);
      const listed = yield* storage.listTriggers([TRIAGE]);
      const found = yield* storage.findWebhookCommand(webhookCommandName("deploy"));

      expect({ found, listed, trigger }).toStrictEqual({
        found: { command: DEPLOY.command, secret: ROTATED },
        listed: [{ agent: TRIAGE, headers: HEADERS, token: TOKEN, url: URL_OF }],
        trigger: { agent: TRIAGE, headers: HEADERS, token: TOKEN, url: URL_OF },
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): the first sealing of a store's secrets seals them, and later ones find them unchanged",
  ({ layer }) =>
    Effect.gen(function* sealOnce() {
      const { storage } = yield* openStore(layer);
      const results = yield* Effect.all([storage.sealSecrets, storage.sealSecrets], ONE_AT_A_TIME);

      expect(results).toStrictEqual(["sealed", "unchanged"]);
    }),
);
