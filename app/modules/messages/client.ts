/**
 * The calls a client makes to close and reopen a thread (#216), to list open threads (#219), to search messages
 * (#320), to read an attachment's bytes (#373) and to delete a message (#678), and the answers they share. The SDK's
 * `CookoutClient` has them.
 * Also the body of posting a message (#342).
 */
import type {
  JsonValue,
  ListOpenThreadsResponse,
  Message,
  MessageId,
  TopLevelMessage,
  TopLevelMessageResponse,
} from "./index.ts";
import type { SearchResponse, SearchSort } from "../search/index.ts";
import type { AttachmentId } from "../attachments/index.ts";

/** An attachment's bytes, as `GET /v1/assets/:id` serves them. */
export interface AttachmentBytes {
  readonly bytes: Uint8Array;
  /** The type it is served as: a detected image type, or `application/octet-stream`. */
  readonly contentType: string;
  /** The name it was posted with, for display only: reduce it to a safe base name before writing a file by it. */
  readonly name: string;
}

/** Reading an attachment's bytes. */
export interface AttachmentCalls {
  /**
   * `GET /v1/assets/:id`: an attachment's bytes, for any signed-in identity. An unknown ID is 404
   * `attachment_not_found`.
   */
  readonly getAttachment: (id: AttachmentId) => Promise<AttachmentBytes>;
}

export type { ScheduledMessageCalls } from "../scheduled-messages/client.ts";

/** The answer to deleting a message: the message as it was just before, a top-level message with its counts. */
export interface DeletedMessageResponse {
  readonly message: Message;
}

/**
 * A message just deleted (mattpocock/cookout#681), as it was, sent only on the all-channels feed so every open web UI
 * drops it at once. For a reply, `parent` is its thread's top-level message as it now stands, with the lowered reply
 * count; deleting a top-level message deletes its whole thread and sends one event, for that message alone, with no
 * `parent`. `cookout watch` ignores it. It has no SSE `id`.
 */
export interface MessageDeletedEvent {
  readonly type: "message-deleted";
  readonly message: Message;
  readonly parent?: TopLevelMessage;
}

/** Deleting a message. */
export interface MessageDeleteCalls {
  /**
   * `DELETE /v1/messages/:id`: soft deletes a message and answers it as it was. Deleting a top-level message deletes
   * its whole thread, replies included; deleting a reply leaves the rest of the thread. Its author may delete a
   * message and an admin anyone's, but an agent only its own, admin flag or not: anyone else is 403 `not_owner`. A
   * missing or already deleted message is 404 `message_not_found`, so a retry is harmless. From then on channel pages
   * and thread reads leave it out, as if it had never been posted: a deleted top-level message's thread is 404
   * `message_not_found`, and reply counts, latest replies and repliers count only live replies. There is no undo.
   */
  readonly deleteMessage: (messageId: MessageId) => Promise<DeletedMessageResponse>;
}

/** The body of `PUT /v1/messages/:id/title`. */
export interface SetThreadTitleRequest {
  /**
   * The thread's new title, trimmed, then at most 100 characters on one line (400 `invalid_request` otherwise). Empty,
   * or only whitespace, clears the title.
   */
  readonly title: string;
}

/** Closing, reopening and titling the thread holding a message. */
export interface ClosedThreadCalls {
  /**
   * `PUT /v1/messages/:id/closed`: closes the thread holding the message (any message in it) and answers its top-level
   * message, now with `closedAt` and `closedBy`. Any identity may close any thread; closing a closed one keeps its
   * first closer and time. Closing hides nothing from the API: the inbox, history and `watch` list it as before. A
   * missing message is 404 `message_not_found`.
   */
  readonly closeThread: (messageId: MessageId) => Promise<TopLevelMessageResponse>;
  /**
   * `DELETE /v1/messages/:id/closed`: reopens the thread holding the message and answers its top-level message, now
   * without `closedAt` and `closedBy`. Reopening an open thread changes nothing; a reply in a closed thread reopens it
   * too. A missing message is 404 `message_not_found`.
   */
  readonly reopenThread: (messageId: MessageId) => Promise<TopLevelMessageResponse>;
  /**
   * `PUT /v1/messages/:id/title`: sets or changes the Thread title of the thread holding the message (any message in
   * it) and answers its top-level message, now with `title`, `titleSetBy` (the caller) and `titleSetAt`. Any
   * identity may title any thread; only the latest setter is kept. The title is trimmed; an empty one, or one of only
   * whitespace, clears all three fields. Over 100 characters or with a line break is 400 `invalid_request`, and
   * nothing changes. Setting the same title again changes nothing. A title is not a message: it mentions nobody and
   * moves no Read position, and a reply keeps it. A missing message is 404 `message_not_found`.
   */
  readonly setThreadTitle: (messageId: MessageId, title: string) => Promise<TopLevelMessageResponse>;
}

/** The query of an Open threads page. With no `cursor`, the page starts at the stalest open thread. */
export interface ListOpenThreadsQuery {
  /** Every open thread on the board, not only the ones involving the caller. */
  readonly all?: boolean;
  /** Only threads after this point: pass the previous page's `cursor` to read on. */
  readonly cursor?: string;
  /** 1–200 threads. Default 50. */
  readonly limit?: number;
}

/**
 * `GET /v1/threads/open?all=true&cursor=<cursor>&limit=<n>`: a page of open threads. Without `all=true`, only the
 * threads involving the caller: it wrote the top-level message or a reply, or is mentioned in either.
 */
export const openThreadsPath = "/v1/threads/open";

/** Listing open threads. */
export interface OpenThreadCalls {
  /**
   * `GET /v1/threads/open`: a page of open threads, stalest first by last activity, ties by ID. Without `all`, only
   * the threads involving the caller; pass the answer's `cursor` to read the next page.
   */
  readonly listOpenThreads: (query?: ListOpenThreadsQuery) => Promise<ListOpenThreadsResponse>;
}

/** The name of the search route's query parameter that holds the query as typed. */
export const searchQueryParam = "q";

/** A search: the query as typed, and which page of its results. */
export interface SearchRequest {
  /**
   * The query as typed. Each word matches a word that equals it or starts with it; every word must match. The
   * `from:@name`, `in:#channel`, `before:YYYY-MM-DD` and `after:YYYY-MM-DD` filters narrow it, `@` and `#` optional.
   */
  readonly query: string;
  /**
   * `newest` (the default) lists results newest first; `best` lists first the results made most of the query's words,
   * ties newest first. Pass the same sort with each page's `cursor`.
   */
  readonly sort?: SearchSort;
  /** Only results after this point: pass the previous page's `cursor` to read on. */
  readonly cursor?: string;
  /** 1–200 results. Default 50. */
  readonly limit?: number;
}

/** Searching messages. */
export interface SearchCalls {
  /**
   * `GET /v1/search?q=<query>&sort=newest|best`: a page of the messages and replies in every channel whose text
   * matches the query, newest first or best match first, Closed threads included, each with whether its thread is Closed. Pass the answer's `cursor` to read
   * the next page. A query with neither words nor filters is 400 `empty_query`; a filter naming no identity, no channel
   * or no real day is 400 `unknown_identity`, `unknown_channel` or `invalid_date`; an unknown sort, or a cursor from
   * the other sort, is 400 `invalid_request`; a command token is 403
   * `outside_command_thread`.
   */
  readonly search: (request: SearchRequest) => Promise<SearchResponse>;
}

/** The body of `POST /v1/messages`. The server checks every field. */
export interface PostMessageRequest {
  readonly channel: string;
  readonly text: string;
  readonly data?: JsonValue;
  /**
   * Reply to this message. A reply to a reply goes to the top-level message's thread, which `close` also closes. A
   * reply to any message in a deleted thread is refused 409 `thread_deleted`, and nothing is stored.
   */
  readonly replyTo?: number;
  readonly close?: true;
  /**
   * A Thread title for a top-level message, stored with it in one step, its author the setter at its post time. The
   * title is trimmed, then at most 100 characters on one line; an empty one posts the message untitled. With
   * `replyTo`, or over 100 characters or with a line break, the post is 400 `invalid_request`, and nothing is stored.
   */
  readonly title?: string;
  /**
   * With `replyTo`: the caller has read the thread up to this message, later than `replyTo`. `replyTo` alone says it
   * has read up to `replyTo`. An agent's reply to a thread with newer replies by anyone else is refused `thread_moved`.
   * A deleted thread is refused `thread_deleted` first, saying with `seen` later than `replyTo` that it was deleted
   * since you read it. A deleted reply is never a newer reply.
   */
  readonly seen?: number;
}
