import { Array as Arr, Effect, Predicate } from "effect";
import { isMessageId, reactionNames } from "../../index.ts";
import type { MessageId } from "../../index.ts";
import type { Refusal } from "../../../http/index.ts";
import { echoed } from "../../../http/index.ts";

interface MisplacedReply {
  readonly channel: string;
  readonly replyTo?: MessageId;
}

interface ReplyReading {
  readonly replyTo?: MessageId | undefined;
  readonly seen?: MessageId | undefined;
}

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

function messageNotFound(asked: string): Refusal {
  return { code: "message_not_found", message: `There is no message ${echoed(asked)}.`, status: NOT_FOUND };
}

function threadIdOf(asked: string): Effect.Effect<MessageId, Refusal> {
  const id = Number(asked);
  if (isMessageId(id)) {
    return Effect.succeed(id);
  }
  return Effect.fail(messageNotFound(asked));
}

function replyInOtherChannel({ channel, replyTo }: MisplacedReply): Refusal {
  return {
    code: "reply_in_other_channel",
    message: `Message ${String(replyTo)} is not in ${channel}. Reply in the message's own channel.`,
    status: BAD_REQUEST,
  };
}

function reactionNotFound(asked: string): Refusal {
  return {
    code: "reaction_not_found",
    message: `There is no reaction ${echoed(asked)}. Use ${Arr.join(reactionNames, " or ")}.`,
    status: NOT_FOUND,
  };
}

function threadDeleted({ replyTo, seen }: ReplyReading): Refusal {
  if (Predicate.isNotUndefined(replyTo) && Predicate.isNotUndefined(seen) && seen > replyTo) {
    return {
      code: "thread_deleted",
      message: "The thread was deleted since you read it. Nothing was posted.",
      status: CONFLICT,
    };
  }
  return { code: "thread_deleted", message: "The thread was deleted.", status: CONFLICT };
}

const replyOutsideWebhookCommandThread: Refusal = {
  code: "outside_command_thread",
  message: "A command token can only reply in its call's thread, in that thread's channel.",
  status: FORBIDDEN,
};

const closeWithoutReplyTo: Refusal = {
  code: "invalid_request",
  message: "Only a reply can close its thread: send close with replyTo.",
  status: BAD_REQUEST,
};

const seenWithoutReplyTo: Refusal = {
  code: "invalid_request",
  message: "seen says how far you have read a thread: send it with replyTo.",
  status: BAD_REQUEST,
};

const notOwnMessage: Refusal = {
  code: "not_owner",
  message: "Only a message's author or an admin can delete it, and an agent only its own.",
  status: FORBIDDEN,
};

const closeWithWebhookCommandToken: Refusal = {
  code: "outside_command_thread",
  message: "A command token can only reply in its call's thread, not close it.",
  status: FORBIDDEN,
};

export type { Refusal } from "../../../http/index.ts";
export {
  closeWithWebhookCommandToken,
  closeWithoutReplyTo,
  messageNotFound,
  notOwnMessage,
  reactionNotFound,
  replyInOtherChannel,
  replyOutsideWebhookCommandThread,
  seenWithoutReplyTo,
  threadDeleted,
  threadIdOf,
};
