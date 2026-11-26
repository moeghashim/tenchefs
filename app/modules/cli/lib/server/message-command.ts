import { Argument, Command, Flag } from "effect/cli";
import type { ListMessagesQuery, MessageId } from "../../../messages/index.ts";
import { Option, Schema } from "effect";
import { answer, answered, refused } from "./output.ts";
import { attachFlag, postAttaching } from "./attachments.ts";
import type { AgentSessionStateNeeds } from "./agent-session-state.ts";
import type { CommandFailed } from "./output.ts";
import type { Effect } from "effect";
import type { PostMessageRequest } from "../../../messages/client.ts";
import { isMessageId } from "../../../messages/index.ts";

interface PostFlags {
  readonly attach: readonly string[];
  readonly channel: string;
  readonly close: boolean;
  readonly data: Option.Option<Schema.Json>;
  readonly replyTo: Option.Option<number>;
  readonly seen: Option.Option<number>;
  readonly text: string;
}

interface UsageProblem {
  readonly code: "usage";
  readonly message: string;
}

const NOTHING = {};

const closeWithoutReplyTo: UsageProblem = {
  code: "usage",
  message: "--close closes the thread a reply joins: give it with --reply-to <message-id>.",
};

const seenWithoutReplyTo: UsageProblem = {
  code: "usage",
  message: "--seen says how far you have read the thread you reply in: give it with --reply-to <message-id>.",
};

function usageProblem({ close, replyTo, seen }: PostFlags): Option.Option<UsageProblem> {
  if (Option.isSome(replyTo)) {
    return Option.none();
  }
  if (close) {
    return Option.some(closeWithoutReplyTo);
  }
  return Option.map(seen, () => seenWithoutReplyTo);
}

function withClose(request: PostMessageRequest, close: boolean): PostMessageRequest {
  if (close) {
    return { ...request, close };
  }
  return request;
}

function postRequest({ channel, close, data, replyTo, seen, text }: PostFlags): PostMessageRequest {
  const withData = Option.match(data, { onNone: () => NOTHING, onSome: (value) => ({ data: value }) });
  const withReplyTo = Option.match(replyTo, { onNone: () => NOTHING, onSome: (value) => ({ replyTo: value }) });
  const withSeen = Option.match(seen, { onNone: () => NOTHING, onSome: (value) => ({ seen: value }) });
  return withClose({ channel, text, ...withData, ...withReplyTo, ...withSeen }, close);
}

function posted(flags: PostFlags): Effect.Effect<void, CommandFailed, AgentSessionStateNeeds> {
  const posting = postAttaching({ files: flags.attach, request: postRequest(flags) });
  return answered(posting);
}

const channelArgument = Argument.String("channel").pipe(Argument.withDescription("The channel's name."));
const textArgument = Argument.String("text").pipe(
  Argument.withDefault(""),
  Argument.withDescription("The message, up to 40,000 characters. Only a message with --attach may leave it out."),
);
const jsonData = Flag.String("data").pipe(Flag.withSchema(Schema.fromJsonString(Schema.Json)));
const dataFlag = jsonData.pipe(Flag.optional, Flag.withDescription("Any JSON value, for commands and agents to read."));
const replyToFlag = Flag.Int("reply-to").pipe(
  Flag.optional,
  Flag.withDescription(
    "Reply in this message's thread, having read it up to this message. A reply to a reply joins the same thread.",
  ),
);
const seenFlag = Flag.Int("seen").pipe(
  Flag.optional,
  Flag.withDescription(
    "With --reply-to: you have read the thread up to this later message. Newer replies by others get it refused with thread_moved, and a thread deleted since with thread_deleted.",
  ),
);
const closeFlag = Flag.Boolean("close").pipe(
  Flag.withDefault(false),
  Flag.withDescription("With --reply-to, also close the thread, in the same step as the reply."),
);

const messagePostCommand = Command.make(
  "post",
  {
    attach: attachFlag,
    channel: channelArgument,
    close: closeFlag,
    data: dataFlag,
    replyTo: replyToFlag,
    seen: seenFlag,
    text: textArgument,
  },
  (flags) =>
    Option.match(usageProblem(flags), {
      onNone: () => posted(flags),
      onSome: refused,
    }),
).pipe(
  Command.withDescription(
    "Post a message, or a reply with --reply-to, which --close also closes in one step. --attach adds files.",
  ),
);

interface ListFlags {
  readonly before: Option.Option<number>;
  readonly channel: string;
  readonly limit: Option.Option<number>;
}

function pageQuery({ before, limit }: Omit<ListFlags, "channel">): ListMessagesQuery {
  const withBefore = Option.match(before, { onNone: () => NOTHING, onSome: (value) => ({ before: value }) });
  const withLimit = Option.match(limit, { onNone: () => NOTHING, onSome: (value) => ({ limit: value }) });
  return { ...withBefore, ...withLimit };
}

function messageIdOf(value: number): Option.Option<MessageId> {
  return Option.liftPredicate(value, isMessageId);
}

function notAMessageId(value: number): string {
  return `${String(value)} is not a message ID.`;
}

const beforeFlag = Flag.Int("before").pipe(
  Flag.optional,
  Flag.withDescription("Only messages before this message ID."),
);
const limitFlag = Flag.Int("limit").pipe(Flag.optional, Flag.withDescription("1-200 messages. Default 50."));
const messageIdArgument = Argument.Int("message-id").pipe(Argument.filterMap(messageIdOf, notAMessageId));

const messageListCommand = Command.make(
  "list",
  { before: beforeFlag, channel: channelArgument, limit: limitFlag },
  (flags) => answer((client) => client.listMessages(flags.channel, pageQuery(flags))),
).pipe(Command.withDescription("List a channel's top-level messages, oldest first: the newest page, or --before."));

const messageDeleteCommand = Command.make("delete", { id: messageIdArgument }, ({ id }) =>
  answer((client) => client.deleteMessage(id)),
).pipe(
  Command.withDescription(
    "Delete a message and print it as it was: your own, or anyone's as an admin human. A top-level message takes its " +
      "whole thread with it. There is no undo.",
  ),
);

const messageCommand = Command.make("message").pipe(
  Command.withDescription("Post, page through and delete a channel's messages."),
  Command.withSubcommands([messagePostCommand, messageListCommand, messageDeleteCommand]),
);

export { beforeFlag, channelArgument, limitFlag, messageCommand, messageIdArgument, pageQuery };
export { scheduleCommand } from "./schedule.ts";
