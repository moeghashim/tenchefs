/**
 * Attachments on the backend: what a file's content is, judged by its first bytes only; the refusals a post's
 * attachments can get; putting a post's bytes in the asset store before its message is recorded; and the route that
 * serves an attachment's bytes, `GET /v1/assets/<id>`, behind the server's token gate.
 *
 * Nothing posted can run in the board's origin (chief of staff, 2026-11-24, board msg 3033): only PNG, JPEG, GIF and
 * WebP content counts as an image, whatever its name, and is served inline as that type; everything else, SVG and HTML
 * included, is served as `application/octet-stream` with `Content-Disposition: attachment`. Every answer carries
 * `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` and `Cache-Control:
 * private`. The given name is a label only: it never decides a type, a disposition or a path.
 */
import { Array as Arr, Effect, Option, Predicate, String as Str, pipe } from "effect";
import { AssetStore, Storage } from "../storage/server.ts";
import type { Attachment, AttachmentContentType, AttachmentId, ImageContentType, NewAttachment } from "./index.ts";
import {
  assetPath,
  attachmentLimits,
  attachmentNameMaximumLength,
  hasContent,
  isAttachmentId,
  opaqueContentType,
} from "./index.ts";
import { HttpServerResponse } from "effect/http";
import type { Refusal } from "../http/index.ts";
import type { Route } from "../http/server.ts";
import { Secrets } from "../secrets/server.ts";
import type { StorageUnavailable } from "../storage/server.ts";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const TOO_LARGE = 413;
const NO_BYTES = 0;
const START = 0;
const HEAD_LENGTH = 12;
const BYTES_IN_A_MEGABYTE = 1_000_000;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

const IMAGE_SIGNATURES: readonly (readonly [ImageContentType, string])[] = [
  ["image/png", String.raw`^\u0089PNG\r\n\u001A\n`],
  ["image/jpeg", String.raw`^\u00FF\u00D8\u00FF`],
  ["image/gif", "^GIF8[79]a"],
  ["image/webp", String.raw`^RIFF[\s\S]{4}WEBP`],
];

const serving = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-security-policy": "sandbox; default-src 'none'",
  "x-content-type-options": "nosniff",
};

const megabytes = `${String(attachmentLimits.maximumBytes / BYTES_IN_A_MEGABYTE)} MB`;

const tooMany: Refusal = {
  code: "too_many_attachments",
  message: `A message can have at most ${String(attachmentLimits.maximumCount)} attachments.`,
  status: BAD_REQUEST,
};

const unnamed: Refusal = {
  code: "attachment_unnamed",
  message: `Every attachment needs a file name of 1 to ${String(attachmentNameMaximumLength)} characters.`,
  status: BAD_REQUEST,
};

const messageEmpty: Refusal = {
  code: "message_empty",
  message: "A message needs text, with or without attachments.",
  status: BAD_REQUEST,
};

const attachmentNotFound: Refusal = {
  code: "attachment_not_found",
  message: "No attachment has that ID.",
  status: NOT_FOUND,
};

const tooLarge: Refusal = {
  code: "attachment_too_large",
  message: `An attachment is over ${megabytes}: each attachment can be at most ${megabytes} (${String(attachmentLimits.maximumBytes)} bytes).`,
  status: TOO_LARGE,
};

function empty(name: string): Refusal {
  return {
    code: "attachment_empty",
    message: `${name} is empty: an attachment needs at least 1 byte.`,
    status: BAD_REQUEST,
  };
}

function detectContent(bytes: NewAttachment["bytes"]): Pick<Attachment, "contentType" | "image"> {
  const head = String.fromCodePoint(...bytes.subarray(START, HEAD_LENGTH));
  const found: Option.Option<AttachmentContentType> = Arr.findFirst(IMAGE_SIGNATURES, ([, signature]) =>
    new RegExp(signature, "u").test(head),
  ).pipe(Option.map(([type]) => type));
  return Option.match(found, {
    onNone: () => ({ contentType: opaqueContentType, image: false }),
    onSome: (contentType) => ({ contentType, image: true }),
  });
}

function refusalOf(attachment: NewAttachment): Option.Option<Refusal> {
  if (attachment.name === "" || attachment.name.length > attachmentNameMaximumLength) {
    return Option.some(unnamed);
  }
  if (attachment.bytes.length === NO_BYTES) {
    return Option.some(empty(attachment.name));
  }
  return Option.none();
}

interface Putting {
  readonly files: readonly NewAttachment[];
  readonly newId: Effect.Effect<AttachmentId>;
}

function postRefusal(post: Post): Option.Option<Refusal> {
  if (!hasContent(post)) {
    return Option.some(messageEmpty);
  }
  return Arr.findFirst(post.attachments, (attachment) => Option.isSome(refusalOf(attachment))).pipe(
    Option.flatMap(refusalOf),
  );
}

interface Described {
  readonly attachment: Attachment;
  readonly bytes: Uint8Array;
}

function putAttachments({
  files,
  newId,
}: Putting): Effect.Effect<readonly Attachment[], StorageUnavailable, AssetStore> {
  return Effect.gen(function* putEach() {
    const assets = yield* AssetStore;
    const described = yield* Effect.forEach(
      files,
      ({ bytes, name }) =>
        Effect.map(
          newId,
          (id): Described => ({ attachment: { id, name, size: bytes.length, ...detectContent(bytes) }, bytes }),
        ),
      ONE_AT_A_TIME,
    );
    const attachments = Arr.map(described, ({ attachment }) => attachment);
    yield* Effect.forEach(described, ({ attachment, bytes }) => assets.put(attachment.id, bytes), {
      ...ONE_AT_A_TIME,
      discard: true,
    }).pipe(Effect.onError(() => Effect.ignore(assets.remove(Arr.map(attachments, ({ id }) => id)))));
    return attachments;
  });
}

const PLAIN_NAME = /[^\w .-]/gu;
const FALLBACK_NAME = "attachment";
const ONLY_DOTS = /^\.*$/u;

function plainName(name: string): string {
  const plain = Str.trim(Str.replaceAll(PLAIN_NAME, "_")(name));
  if (ONLY_DOTS.test(plain)) {
    return FALLBACK_NAME;
  }
  return plain;
}

function encodedName(name: string): string {
  return pipe(
    encodeURIComponent(name),
    Str.replaceAll("'", "%27"),
    Str.replaceAll("(", "%28"),
    Str.replaceAll(")", "%29"),
    Str.replaceAll("*", "%2A"),
  );
}

function contentDisposition({ image, name }: Pick<Attachment, "image" | "name">): string {
  const named = `filename="${plainName(name)}"; filename*=UTF-8''${encodedName(name)}`;
  if (image) {
    return `inline; ${named}`;
  }
  return `attachment; ${named}`;
}

function served(attachment: Attachment): Effect.Effect<HttpServerResponse.HttpServerResponse, never, AssetStore> {
  return Effect.map(AssetStore, (assets) =>
    HttpServerResponse.stream(assets.read(attachment.id), {
      contentLength: attachment.size,
      contentType: attachment.contentType,
      headers: { ...serving, "content-disposition": contentDisposition(attachment) },
    }),
  );
}

const assetRoute: Route<Storage | AssetStore> = {
  handle: (params) =>
    Effect.gen(function* serveAsset() {
      const asked = String(params["id"]);
      if (!isAttachmentId(asked)) {
        return yield* Effect.fail(attachmentNotFound);
      }
      const storage = yield* Storage;
      const found = yield* storage.findAttachment(asked);
      if (Predicate.isUndefined(found)) {
        return yield* Effect.fail(attachmentNotFound);
      }
      return yield* served(found);
    }),
  method: "GET",
  path: assetPath,
};

/** The refusal of a file over the size limit, for a multipart parse that stopped at the limit. */
export const fileTooLarge: Refusal = tooLarge;

/** The refusal of a part with no file name, for a multipart parse. */
export const attachmentUnnamed: Refusal = unnamed;

/** The refusal of more attachments than a message can have, for a multipart parse. */
export const tooManyAttachments: Refusal = tooMany;

/** The attachment routes, for the server's route list. They need `Caller` from the token gate, `Storage` and `AssetStore`. */
export const attachmentRoutes: readonly Route<Storage | AssetStore>[] = [assetRoute];

/** A post's text, empty when none was given, and the files posted with it. */
export interface Post {
  readonly text: string;
  readonly attachments: readonly NewAttachment[];
}

/** A post's files once their bytes are in the asset store: how the message lists them, and how to take them back. */
export interface StoredFiles {
  readonly attachments: readonly Attachment[];
  /** Removes the bytes again, for a post refused or failed after they were put. */
  readonly remove: Effect.Effect<void>;
}

/**
 * Checks a post's text and its files' names and bytes, then puts the files' bytes in the asset store. The size and
 * count limits are the multipart parse's (`fileTooLarge`, `tooManyAttachments`), which stops at them first.
 */
export interface Attaching {
  readonly store: (post: Post) => Effect.Effect<StoredFiles, Refusal | StorageUnavailable>;
}

/** What `openAttaching` needs. */
export type AttachingNeeds = AssetStore | Secrets;

/** `Attaching` over the asset store, with each attachment's ID from `Secrets`. */
export const openAttaching: Effect.Effect<Attaching, never, AttachingNeeds> = Effect.gen(function* openAttaching() {
  const assets = yield* AssetStore;
  const { newAttachmentId } = yield* Secrets;
  return {
    store: (post) =>
      Effect.gen(function* storeFiles() {
        yield* Effect.flip(Effect.fromOption(postRefusal(post)));
        const attachments = yield* putAttachments({ files: post.attachments, newId: newAttachmentId }).pipe(
          Effect.provideService(AssetStore, assets),
        );
        const remove = Effect.ignore(assets.remove(Arr.map(attachments, (attachment) => attachment.id)));
        return { attachments, remove };
      }),
  };
});
