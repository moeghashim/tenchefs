import { Array as Arr, Effect, FileSystem, Path, Redacted } from "effect";
import type { CommandLineNeeds, ServeProcess } from "../../../testing/server.ts";
import {
  answer,
  freshDatabasePath,
  freshS3Bucket,
  freshStateFolder,
  runCookout,
  s3ServeSettings,
  startServe,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { AttachmentId } from "../../../attachments/index.ts";
import { NodeServices } from "@effect/platform-node";
import type { S3Bucket } from "../../../storage/server.ts";
import type { Scope } from "effect";
import type { Secrets } from "../../../secrets/server.ts";
import { request } from "../../../http/client.ts";
import { secretsLive } from "../../../secrets/server.ts";
import { testClient } from "../../../testing/index.ts";

const SIZE = 200_000;
const PATTERN = 253;
const EXIT_SUCCESS = 0;
const SERVED_SAFELY = /^200\n[^]*\nnosniff\n/u;
const BYTES = Uint8Array.from(Arr.makeBy(SIZE, (index) => index % PATTERN));

interface PostedOnS3 {
  readonly bucket: S3Bucket;
  readonly database: string;
  readonly id: AttachmentId;
  readonly server: ServeProcess;
}

interface Downloaded {
  readonly exitCode: number;
  readonly written: Uint8Array;
}

type Needs = NodeServices.NodeServices | Secrets | Scope.Scope;

const postedOnS3: Effect.Effect<PostedOnS3, never, Needs> = Effect.gen(function* postOnS3() {
  const bucket = yield* Effect.orDie(freshS3Bucket);
  const database = yield* freshDatabasePath;
  const server = yield* startServe({ database, env: s3ServeSettings(bucket) });
  const admin = testClient({ env: {}, token: server.adminToken, url: server.url });
  yield* answer(() => admin.createChannel({ name: "grill" }));
  const attachments = [{ bytes: BYTES, name: "trace.bin" }];
  const { message } = yield* answer(() => admin.createMessage({ attachments, channel: "grill", text: "the trace" }));
  const listed = Effect.succeed(message.attachments ?? []);
  const [{ id }] = yield* Effect.orDie(Effect.filterOrFail(listed, Arr.isReadonlyArrayNonEmpty));
  return { bucket, database, id, server };
});

function assetGet({ id, server }: PostedOnS3): Effect.Effect<Downloaded, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* downloadWithCli() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = yield* freshStateFolder;
    const target = path.join(folder, "trace.bin");
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: server.adminToken, COOKOUT_URL: server.url };
    const { exitCode } = yield* runCookout({ args: ["asset", "get", id, "-o", target], env });
    const read = yield* Effect.orDie(fs.readFile(target));
    return { exitCode, written: Uint8Array.from(read) };
  });
}

function servedHeaders({ id, server }: PostedOnS3): Effect.Effect<string> {
  const served = answer(() =>
    request({
      baseUrl: server.url,
      headers: { authorization: `Bearer ${server.adminToken}` },
      method: "GET",
      params: { id },
      path: "/v1/assets/:id",
    }),
  );
  return Effect.map(served, ({ headers, status }) => Arr.join([String(status), ...headers.values()], "\n"));
}

function assetsFolderBeside(database: string): Effect.Effect<boolean, never, NodeServices.NodeServices> {
  return Effect.gen(function* assetsFolderExists() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = path.join(path.dirname(database), "assets");
    return yield* Effect.orDie(fs.exists(folder));
  });
}

it.effect(
  "cookout serve on the S3 asset store keeps a posted attachment in the bucket, and asset get reads it back",
  () =>
    Effect.gen(function* s3RoundTrip() {
      const posted = yield* postedOnS3;
      const { exitCode, written } = yield* assetGet(posted);
      const headers = yield* servedHeaders(posted);
      const onDisk = yield* assetsFolderBeside(posted.database);

      expect([exitCode, written, onDisk]).toStrictEqual([EXIT_SUCCESS, BYTES, false]);
      expect(headers).toMatch(SERVED_SAFELY);
      expect(headers).not.toContain(posted.bucket.bucket);
      expect(posted.server.stdout).not.toContain(Redacted.value(posted.bucket.secret));
    }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);
