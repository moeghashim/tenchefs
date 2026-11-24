import { expect, it } from "@effect/vitest";
import { freshDatabasePath, runServe } from "../../../testing/server.ts";
import { Effect } from "effect";
import { NodeServices } from "@effect/platform-node";
import { secretsLive } from "../../../secrets/server.ts";

const EXIT_FAILURE = 1;

const S3_SETTINGS = {
  COOKOUT_ASSET_STORE: "s3",
  COOKOUT_S3_ACCESS_KEY_ID: "access-key-id-for-the-test",
  COOKOUT_S3_BUCKET: "bucket-for-the-test",
  COOKOUT_S3_ENDPOINT: "https://s3.example.test",
  COOKOUT_S3_REGION: "region-for-the-test",
  COOKOUT_S3_SECRET_ACCESS_KEY: "secret-access-key-for-the-test",
};

const S3_SETTING_NAMES = [
  "COOKOUT_S3_BUCKET",
  "COOKOUT_S3_ENDPOINT",
  "COOKOUT_S3_REGION",
  "COOKOUT_S3_ACCESS_KEY_ID",
  "COOKOUT_S3_SECRET_ACCESS_KEY",
] as const;

it.effect.each(S3_SETTING_NAMES)(
  "cookout serve on the S3 asset store refuses to start without %s, naming it and showing no value",
  (name) =>
    Effect.gen(function* refusesMissingS3Setting() {
      const database = yield* freshDatabasePath;
      const refused = yield* runServe({ database, env: { ...S3_SETTINGS, [name]: "" } });

      expect(refused).toMatchObject({ exitCode: EXIT_FAILURE, stdout: "" });
      expect(refused.stderrJson).toStrictEqual({
        error: {
          code: "s3_settings_missing",
          message: `COOKOUT_ASSET_STORE is s3, but ${name} is not set. Set each, or leave COOKOUT_ASSET_STORE unset to keep attachments on disk.`,
        },
      });
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect("cookout serve on the S3 asset store with no S3 settings at all names every one it needs", () =>
  Effect.gen(function* refusesAllMissing() {
    const database = yield* freshDatabasePath;
    const refused = yield* runServe({ database, env: { COOKOUT_ASSET_STORE: "s3" } });

    expect(refused.stderrJson).toMatchObject({ error: { code: "s3_settings_missing" } });
    expect(refused.stderr).toContain(
      "COOKOUT_S3_ACCESS_KEY_ID, COOKOUT_S3_BUCKET, COOKOUT_S3_ENDPOINT, COOKOUT_S3_REGION, COOKOUT_S3_SECRET_ACCESS_KEY are not set",
    );
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

it.effect(
  "cookout serve refuses a COOKOUT_S3_ENDPOINT that isn't a URL, and a COOKOUT_ASSET_STORE it doesn't know",
  () =>
    Effect.gen(function* refusesBadS3Settings() {
      const endpoint = yield* runServe({
        database: yield* freshDatabasePath,
        env: { ...S3_SETTINGS, COOKOUT_S3_ENDPOINT: "not a url" },
      });
      const kind = yield* runServe({ database: yield* freshDatabasePath, env: { COOKOUT_ASSET_STORE: "r2" } });

      expect([endpoint.exitCode, kind.exitCode]).toStrictEqual([EXIT_FAILURE, EXIT_FAILURE]);
      expect([endpoint.stderrJson, kind.stderrJson]).toStrictEqual([
        {
          error: {
            code: "s3_endpoint_invalid",
            message: "COOKOUT_S3_ENDPOINT must be a URL, such as https://<account>.r2.cloudflarestorage.com.",
          },
        },
        {
          error: { code: "asset_store_invalid", message: "COOKOUT_ASSET_STORE must be disk or s3, or empty for disk." },
        },
      ]);
      expect(endpoint.stderr).not.toContain(S3_SETTINGS.COOKOUT_S3_SECRET_ACCESS_KEY);
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
