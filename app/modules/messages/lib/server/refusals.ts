import { Array as Arr } from "effect";
import type { MessageId } from "../../index.ts";
import type { Refusal } from "../../../http/index.ts";
import { echoed } from "../../../http/index.ts";
import { reactionNames } from "../../index.ts";

interface MisplacedReply {
  readonly channel: string;
  readonly replyTo?: MessageId;
}

const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;

function messageNotFound(asked: string): Refusal {
  return { code: "message_not_found", message: `There is no message ${echoed(asked)}.`, status: NOT_FOUND };
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

const replyOutsideCommandThread: Refusal = {
  code: "outside_command_thread",
  message: "A command token can only reply in its call's thread, in that thread's channel.",
  status: FORBIDDEN,
};

const closeWithoutReplyTo: Refusal = {
  code: "invalid_request",
  message: "Only a reply can close its thread: send close with replyTo.",
  status: BAD_REQUEST,
};

const closeWithCommandToken: Refusal = {
  code: "outside_command_thread",
  message: "A command token can only reply in its call's thread, not close it.",
  status: FORBIDDEN,
};

export {
  closeWithCommandToken,
  closeWithoutReplyTo,
  messageNotFound,
  reactionNotFound,
  replyInOtherChannel,
  replyOutsideCommandThread,
};
