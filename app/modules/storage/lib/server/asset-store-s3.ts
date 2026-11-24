import { AssetStore, missing } from "./asset-store.ts";
import { Effect, Layer, Option, Record as Rec, Redacted, String as Str, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import type { AttachmentId } from "../../../attachments/index.ts";
import { AwsV4Signer } from "aws4fetch";
import type { HttpClientResponse } from "effect/http";
import { StorageUnavailable } from "./errors.ts";

interface S3Bucket {
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly accessKey: string;
  readonly secret: Redacted.Redacted;
}

type Method = "GET" | "PUT" | "DELETE";

type Response = HttpClientResponse.HttpClientResponse;

interface Sending {
  readonly method: Method;
  readonly id: AttachmentId;
  readonly body: Option.Option<Uint8Array>;
}

const OK = 200;
const NOT_FOUND = 404;
const LAST_SUCCESS = 299;
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;
const TRAILING_SLASHES = /\/+$/u;

function unreachable({ message }: { readonly message: string }): StorageUnavailable {
  return StorageUnavailable.make({ message: `The asset store's S3 bucket could not be reached: ${message}` });
}

function refusedBy(method: Method, id: AttachmentId, status: number): StorageUnavailable {
  return StorageUnavailable.make({
    message: `The asset store's S3 bucket answered ${String(status)} to ${method} for attachment ${id}.`,
  });
}

function succeeded(response: Response): boolean {
  return response.status >= OK && response.status <= LAST_SUCCESS;
}

function objectUrl({ bucket, endpoint }: S3Bucket, id: AttachmentId): string {
  return `${Str.replace(TRAILING_SLASHES, "")(endpoint)}/${encodeURIComponent(bucket)}/${encodeURIComponent(id)}`;
}

function signed(settings: S3Bucket, { method, id }: Sending): Effect.Effect<HttpClientRequest.HttpClientRequest> {
  const signer = new AwsV4Signer({
    accessKeyId: settings.accessKey,
    method,
    region: settings.region,
    secretAccessKey: Redacted.value(settings.secret),
    service: "s3",
    url: objectUrl(settings, id),
  });
  return Effect.gen(function* signRequest() {
    const { headers, url } = yield* Effect.promise(() => signer.sign());
    return HttpClientRequest.make(method)(url).pipe(HttpClientRequest.setHeaders(Rec.fromEntries([...headers])));
  });
}

function withBody(body: Option.Option<Uint8Array>) {
  return (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest =>
    Option.match(body, {
      onNone: () => request,
      onSome: (bytes) => HttpClientRequest.bodyUint8Array(request, bytes, "application/octet-stream"),
    });
}

function expectSuccess(method: Method, id: AttachmentId) {
  return (response: Response): Effect.Effect<void, StorageUnavailable> => {
    if (succeeded(response)) {
      return Effect.void;
    }
    return Effect.fail(refusedBy(method, id, response.status));
  };
}

function bodyOf(id: AttachmentId) {
  return (response: Response): Stream.Stream<Uint8Array, StorageUnavailable> => {
    if (response.status === NOT_FOUND) {
      return Stream.fail(missing(id));
    }
    if (!succeeded(response)) {
      return Stream.fail(refusedBy("GET", id, response.status));
    }
    return Stream.mapError(response.stream, unreachable);
  };
}

const neverRedirected = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { redirect: "manual" })),
);

function openS3Assets(settings: S3Bucket): Effect.Effect<AssetStore["Service"], never, HttpClient.HttpClient> {
  return Effect.gen(function* openBucket() {
    const client = yield* HttpClient.HttpClient;
    function send(sending: Sending): Effect.Effect<Response, StorageUnavailable> {
      return signed(settings, sending).pipe(
        Effect.map(withBody(sending.body)),
        Effect.flatMap((request) => Effect.mapError(client.execute(request), unreachable)),
      );
    }
    const none = Option.none<Uint8Array>();
    return AssetStore.of({
      put: (id, bytes) =>
        Effect.flatMap(send({ body: Option.some(bytes), id, method: "PUT" }), expectSuccess("PUT", id)),
      read: (id) => Stream.unwrap(Effect.map(send({ body: none, id, method: "GET" }), bodyOf(id))),
      remove: (ids) =>
        Effect.forEach(
          ids,
          (id) => Effect.flatMap(send({ body: none, id, method: "DELETE" }), expectSuccess("DELETE", id)),
          ONE_AT_A_TIME,
        ),
    });
  });
}

function s3AssetStore(settings: S3Bucket): Layer.Layer<AssetStore> {
  return Layer.effect(AssetStore, openS3Assets(settings)).pipe(Layer.provide(neverRedirected));
}

export { s3AssetStore };
export type { S3Bucket };
