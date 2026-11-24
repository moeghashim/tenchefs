/**
 * Attachments on the wire, shared by the server, the SDK and the CLI: the `AttachmentId` brand and its check, an
 * attachment as a message lists it, the limits a post is held to, and the path that serves an attachment's bytes. An
 * attachment is any file, fixed when its message is posted (Matt,
 * 2026-11-24, board thread 2905, msgs 2906, 2997 and 3032).
 */

declare const brand: unique symbol;

/** An attachment's ID: opaque and random, so it gives away nothing about how many the board holds. */
export type AttachmentId = string & { readonly [brand]: "AttachmentId" };

/**
 * The rule every attachment ID follows: 1 to 64 base64url characters, so an ID can never name another path. The
 * server makes new ones in hex, so none starts with `-` and reads as a flag on a command line.
 */
export const attachmentIdPattern = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * Whether `value` looks like an attachment ID; if so, it is an `AttachmentId`.
 * @param value The ID to check.
 * @returns Whether `value` is an `AttachmentId`.
 */
export function isAttachmentId(value: string): value is AttachmentId {
  return attachmentIdPattern.test(value);
}

/** The image types an attachment is detected as, from its first bytes. */
export type ImageContentType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

/** Every image type an attachment can be detected as. */
export const imageContentTypes: readonly ImageContentType[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** What every attachment that isn't one of the four image types is served as. */
export const opaqueContentType = "application/octet-stream";

/** An attachment's content type: a detected image type, or `application/octet-stream` for anything else. */
export type AttachmentContentType = ImageContentType | typeof opaqueContentType;

/** One attachment, as every message that has some lists it, in posting order. */
export interface Attachment {
  readonly id: AttachmentId;
  /** The name it was posted with. Display only: it never decides a path, a content type or how it is served. */
  readonly name: string;
  /** Its size in bytes. */
  readonly size: number;
  readonly contentType: AttachmentContentType;
  /** Whether its content is a PNG, JPEG, GIF or WebP image, whatever its name says. */
  readonly image: boolean;
}

/** The attachments on a message, as `MessageFields` carries them. */
export interface WithAttachments {
  /**
   * The files posted with the message, in posting order, wherever the message is returned, live `message` events
   * included. Absent when it has none. They never change once posted.
   */
  readonly attachments?: readonly Attachment[];
}

/** One file to attach to a post: the name to show and its bytes. */
export interface NewAttachment {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * The limits a post's attachments are held to (Matt, 2026-11-24, board msg 3032): each at most 10 MB (10,000,000
 * bytes), at most 10 on one message, and none empty.
 */
export const attachmentLimits = { maximumBytes: 10_000_000, maximumCount: 10 } as const;

/** The longest name an attachment keeps, in UTF-16 code units. */
export const attachmentNameMaximumLength = 255;

/**
 * Whether a message may be posted with this text and these attachments. For now it needs text, attachments or not:
 * clients first learn to read a message with attachments and no text, and #398 lets one be posted in the release after
 * (Decision (2026-11-24), following ADR 0076; Matt's rule from board msg 3043 is text, attachments, or both). This is
 * the one place the rule lives.
 * @param message The message's text, empty when none was given, and its attachments.
 * @returns Whether the message has something in it.
 */
export function hasContent(message: { readonly text: string; readonly attachments: readonly unknown[] }): boolean {
  return message.text !== "";
}

/** `GET /v1/assets/:id`: an attachment's bytes, to any signed-in identity. */
export const assetPath = "/v1/assets/:id";

/** The multipart part of `POST /v1/messages` that holds the JSON body of the post. */
export const messagePartName = "message";

/** The multipart part of `POST /v1/messages` that holds one attachment, named by its file name. */
export const attachmentPartName = "attachment";
