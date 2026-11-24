import { Caller, CommandThread, sentHarness } from "../../../identities/server.ts";
import { Effect, Option, Predicate, Schema, String as Str, Stream } from "effect";
import { HttpServerRequest, HttpServerResponse, Multipart } from "effect/http";
import { MessageResponseSchema, PostMessageRequestSchema, PostWithAttachmentsRequestSchema } from "./wire.ts";
import { attachmentLimits, attachmentPartName, messagePartName } from "../../../attachments/index.ts";
import { attachmentRoutes, attachmentUnnamed, fileTooLarge, tooManyAttachments } from "../../../attachments/server.ts";
import { Messages } from "./service.ts";
import type { NewAttachment } from "../../../attachments/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import { messagesPath } from "../../index.ts";

const CREATED = 201;
const MEBIBYTE = 1_048_576;
const BAD_REQUEST = 400;
const TOO_LARGE = 413;
const NO_TEXT = "";
const MULTIPART = "multipart/form-data";
const ALL_ERRORS = { errors: "all" } as const;

const largestPost = attachmentLimits.maximumBytes * attachmentLimits.maximumCount + MEBIBYTE;

const multipartLimits = Multipart.limitsServices({
  fieldMimeTypes: [],
  maxFieldSize: MEBIBYTE,
  maxFileSize: attachmentLimits.maximumBytes,
  maxTotalSize: largestPost,
});

const messagePartMissing: Refusal = {
  code: "invalid_request",
  message: `A multipart post needs one \`${messagePartName}\` part holding the post's JSON body.`,
  status: BAD_REQUEST,
};

const postTooLarge: Refusal = {
  code: "body_too_large",
  message: `A post with attachments can be at most ${String(attachmentLimits.maximumCount)} attachments of 10 MB each, plus a 1 MiB message.`,
  status: TOO_LARGE,
};

const malformed: Refusal = {
  code: "invalid_request",
  message: "The body is not valid multipart/form-data.",
  status: BAD_REQUEST,
};

interface Collected {
  readonly message: Option.Option<string>;
  readonly attachments: readonly NewAttachment[];
}

type PostBody = typeof PostMessageRequestSchema.Type & {
  readonly attachments?: readonly NewAttachment[];
};

const NOTHING_YET: Collected = { attachments: [], message: Option.none() };

const decodeMessage = Schema.decodeUnknownEffect(Schema.fromJsonString(PostWithAttachmentsRequestSchema));

function withFile(
  collected: Collected,
  part: Multipart.Part,
): Effect.Effect<Collected, Refusal | Multipart.MultipartError> {
  if (!Multipart.isFile(part)) {
    return Effect.fail(attachmentUnnamed);
  }
  if (collected.attachments.length >= attachmentLimits.maximumCount) {
    return Effect.fail(tooManyAttachments);
  }
  return Effect.map(part.contentEffect, (bytes) => ({
    ...collected,
    attachments: [...collected.attachments, { bytes, name: part.name }],
  }));
}

function withPart(
  collected: Collected,
  part: Multipart.Part,
): Effect.Effect<Collected, Refusal | Multipart.MultipartError> {
  if (part.key === messagePartName && Multipart.isField(part)) {
    return Effect.succeed({ ...collected, message: Option.some(part.value) });
  }
  if (part.key === attachmentPartName) {
    return withFile(collected, part);
  }
  return Effect.succeed(collected);
}

function refusedTooLarge(): Effect.Effect<never, Refusal> {
  return Effect.fail(postTooLarge);
}

const isMultipart = Effect.map(HttpServerRequest.HttpServerRequest, (request) =>
  Str.startsWith(MULTIPART)(Str.toLowerCase(request.headers["content-type"] ?? "")),
);

const multipartPost = Effect.gen(function* readMultipartPost() {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const collected = yield* request.multipartStream.pipe(
    Stream.runFoldEffect(() => NOTHING_YET, withPart),
    Effect.catchReasons(
      "MultipartError",
      {
        BodyTooLarge: refusedTooLarge,
        FieldTooLarge: refusedTooLarge,
        FileTooLarge: () => Effect.fail(fileTooLarge),
      },
      () => Effect.fail(malformed),
    ),
    Effect.provideContext(multipartLimits),
  );
  const text = yield* Effect.fromOption(collected.message).pipe(Effect.mapError(() => messagePartMissing));
  const body = yield* decodeMessage(text);
  return { ...body, attachments: collected.attachments, text: body.text ?? NO_TEXT };
});

const jsonPost = HttpServerRequest.schemaBodyJson(PostMessageRequestSchema, ALL_ERRORS);

type PostFailure = Effect.Error<typeof multipartPost> | Effect.Error<typeof jsonPost>;

function bodyOf(multipart: boolean): Effect.Effect<PostBody, PostFailure, HttpServerRequest.HttpServerRequest> {
  if (multipart) {
    return multipartPost;
  }
  return jsonPost;
}

const postBody = Effect.flatMap(isMultipart, bodyOf);

function seenOnReply(body: PostBody): PostBody {
  if (Predicate.isUndefined(body.replyTo)) {
    return body;
  }
  return { ...body, seen: body.seen ?? body.replyTo };
}

const postRoute: Route<Caller | Messages> = {
  handle: () =>
    Effect.gen(function* postMessageRoute() {
      const body = yield* postBody;
      const caller = yield* Caller;
      const messages = yield* Messages;
      const thread = yield* CommandThread;
      const posting = { ...seenOnReply(body), ...(yield* sentHarness) };
      const posted = yield* Option.match(thread, {
        onNone: () => messages.post(caller, posting),
        onSome: (threadId) => messages.postInThread(caller, posting, threadId),
      });
      return yield* HttpServerResponse.schemaJson(MessageResponseSchema)(posted, { status: CREATED });
    }),
  method: "POST",
  path: messagesPath,
};

const postRoutes = [postRoute, ...attachmentRoutes];

export { postRoutes };
