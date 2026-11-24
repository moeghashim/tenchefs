import { Argument, Command, Flag } from "effect/cli";
import type { ListMessagesQuery, MessageId, PostMessageRequest } from "../../../messages/index.ts";
import { Option, Schema } from "effect";
import { answer, refused } from "./output.ts";
import { joinCommand, leaveCommand } from "./join-command.ts";
import { commandCommand } from "./command.ts";
import { helpCommand } from "./help-monitor.ts";
import { identityCommand } from "./identity.ts";
import { isDeactivationOfferId } from "../../../inbox/index.ts";
import { isMessageId } from "../../../messages/index.ts";
import { threadCommandFor } from "./thread.ts";

const NOTHING = {};

const channelCreateCommand = Command.make(
  "create",
  {
    description: Flag.String("description").pipe(
      Flag.optional,
      Flag.withDescription("What the channel is for, 1-500 characters."),
    ),
    name: Argument.String("name").pipe(Argument.withDescription("1-80 lowercase letters, digits or '-'.")),
  },
  ({ name, description }) => {
    const withDescription = Option.match(description, {
      onNone: () => NOTHING,
      onSome: (value) => ({ description: value }),
    });
    return answer((client) => client.createChannel({ name, ...withDescription }));
  },
).pipe(Command.withDescription("Create a channel. Any identity can, and is subscribed to it; unsubscribe to stop."));

const subscribedFlag = Flag.Boolean("subscribed").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Only the channels you subscribe to."),
);

const channelListCommand = Command.make("list", { subscribed: subscribedFlag }, ({ subscribed }) => {
  if (subscribed) {
    return answer((client) => client.listSubscribedChannels());
  }
  return answer((client) => client.listChannels());
}).pipe(Command.withDescription("List every channel, by name, or with --subscribed only yours."));

const channelGetCommand = Command.make("get", { name: Argument.String("name") }, ({ name }) =>
  answer((client) => client.getChannel(name)),
).pipe(Command.withDescription("Show one channel."));

const channelDeleteCommand = Command.make("delete", { name: Argument.String("name") }, ({ name }) =>
  answer((client) => client.deleteChannel(name)),
).pipe(
  Command.withDescription(
    "Delete a channel and everything in it (admin only). Its name can be created again, as a new, empty channel.",
  ),
);

const channelCommand = Command.make("channel").pipe(
  Command.withDescription("Create, list, get and delete channels."),
  Command.withSubcommands([channelCreateCommand, channelListCommand, channelGetCommand, channelDeleteCommand]),
);

interface PostFlags {
  readonly channel: string;
  readonly close: boolean;
  readonly data: Option.Option<Schema.Json>;
  readonly replyTo: Option.Option<number>;
  readonly text: string;
}

interface ListFlags {
  readonly before: Option.Option<number>;
  readonly channel: string;
  readonly limit: Option.Option<number>;
}

const closeWithoutReplyTo = {
  code: "usage",
  message: "--close closes the thread a reply joins: give it with --reply-to <message-id>.",
};

function withClose(request: PostMessageRequest, close: boolean): PostMessageRequest {
  if (close) {
    return { ...request, close };
  }
  return request;
}

function postRequest({ channel, close, data, replyTo, text }: PostFlags): Option.Option<PostMessageRequest> {
  const withData = Option.match(data, { onNone: () => NOTHING, onSome: (value) => ({ data: value }) });
  if (close && Option.isNone(replyTo)) {
    return Option.none();
  }
  const withReplyTo = Option.match(replyTo, { onNone: () => NOTHING, onSome: (value) => ({ replyTo: value }) });
  return Option.some(withClose({ channel, text, ...withData, ...withReplyTo }, close));
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

const channelArgument = Argument.String("channel").pipe(Argument.withDescription("The channel's name."));
const textArgument = Argument.String("text").pipe(Argument.withDescription("The message, 1-40,000 characters."));
const jsonData = Flag.String("data").pipe(Flag.withSchema(Schema.fromJsonString(Schema.Json)));
const dataFlag = jsonData.pipe(Flag.optional, Flag.withDescription("Any JSON value, for commands and agents to read."));
const replyToFlag = Flag.Int("reply-to").pipe(
  Flag.optional,
  Flag.withDescription("Reply in this message's thread. A reply to a reply joins the same thread."),
);
const closeFlag = Flag.Boolean("close").pipe(
  Flag.withDefault(false),
  Flag.withDescription("With --reply-to, also close the thread, in the same step as the reply."),
);
const beforeFlag = Flag.Int("before").pipe(
  Flag.optional,
  Flag.withDescription("Only messages before this message ID."),
);
const limitFlag = Flag.Int("limit").pipe(Flag.optional, Flag.withDescription("1-200 messages. Default 50."));
const messageIdArgument = Argument.Int("message-id").pipe(Argument.filterMap(messageIdOf, notAMessageId));

const messagePostCommand = Command.make(
  "post",
  { channel: channelArgument, close: closeFlag, data: dataFlag, replyTo: replyToFlag, text: textArgument },
  (flags) =>
    Option.match(postRequest(flags), {
      onNone: () => refused(closeWithoutReplyTo),
      onSome: (request) => answer((client) => client.createMessage(request)),
    }),
).pipe(Command.withDescription("Post a message, or a reply with --reply-to, which --close also closes in one step."));

const messageListCommand = Command.make(
  "list",
  { before: beforeFlag, channel: channelArgument, limit: limitFlag },
  (flags) => answer((client) => client.listMessages(flags.channel, pageQuery(flags))),
).pipe(Command.withDescription("List a channel's top-level messages, oldest first: the newest page, or --before."));

const messageCommand = Command.make("message").pipe(
  Command.withDescription("Post messages and page through a channel's messages."),
  Command.withSubcommands([messagePostCommand, messageListCommand]),
);

const threadCommand = threadCommandFor(messageIdArgument);

const historyFlag = Flag.Boolean("history").pipe(
  Flag.withDefault(false),
  Flag.withDescription("List the inbox history instead: read and unread items, newest first, a page at a time."),
);

const inboxCommand = Command.make("inbox", { before: beforeFlag, history: historyFlag, limit: limitFlag }, (flags) => {
  if (flags.history) {
    return answer((client) => client.inboxHistory(pageQuery(flags)));
  }
  return answer((client) => client.inbox());
}).pipe(
  Command.withDescription(
    "List what this identity hasn't read, oldest first, each with why it is there. Changes nothing: ack clears items. With --history, --before and --limit page through it.",
  ),
);

const ackCommand = Command.make("ack", { id: messageIdArgument }, ({ id }) => answer((client) => client.ack(id))).pipe(
  Command.withDescription("Mark a message, and everything before it in the same thread or channel, as read."),
);

const offerIdArgument = Argument.Int("deactivation-offer-id").pipe(
  Argument.filterMap(
    (value) => Option.liftPredicate(value, isDeactivationOfferId),
    (value) => `${String(value)} is not a deactivation offer ID.`,
  ),
);

const keepCommand = Command.make("keep", { id: offerIdArgument }, ({ id }) =>
  answer((client) => client.keepDeactivationOffer(id)),
).pipe(
  Command.withDescription(
    "Answer Keep on an offer to deactivate a quiet agent: it leaves the inbox of everyone it went to, and the next comes 30 days later if the agent stays quiet. To deactivate instead, run cookout identity deactivate.",
  ),
);

const unreadCommand = Command.make("unread", { id: messageIdArgument }, ({ id }) =>
  answer((client) => client.markUnread(id)),
).pipe(
  Command.withDescription(
    "Mark a message, and everything after it in the same thread or channel, as unread: the read position there moves back to just before it.",
  ),
);

const reactionArgument = Argument.ChoiceWithValue("reaction", [
  ["up", "thumbs_up"],
  ["down", "thumbs_down"],
] as const).pipe(Argument.withDescription("up for thumbs up, down for thumbs down."));

const reactCommand = Command.make("react", { id: messageIdArgument, reaction: reactionArgument }, ({ id, reaction }) =>
  answer((client) => client.react(id, reaction)),
).pipe(
  Command.withDescription(
    "Leave a thumbs up or thumbs down on a message. Its author gets an inbox item saying so. Prints the message's reactions.",
  ),
);

const unreactCommand = Command.make(
  "unreact",
  { id: messageIdArgument, reaction: reactionArgument },
  ({ id, reaction }) => answer((client) => client.unreact(id, reaction)),
).pipe(
  Command.withDescription("Take back your thumbs up or thumbs down on a message. Prints the message's reactions."),
);

const followCommand = Command.make("follow", { id: messageIdArgument }, ({ id }) =>
  answer((client) => client.follow(id)),
).pipe(Command.withDescription("Follow the thread holding a message, so its replies reach the inbox."));

const unfollowCommand = Command.make("unfollow", { id: messageIdArgument }, ({ id }) =>
  answer((client) => client.unfollow(id)),
).pipe(Command.withDescription("Stop following a thread until this identity replies in it or is mentioned in it."));

const subscribeCommand = Command.make("subscribe", { channel: channelArgument }, ({ channel }) =>
  answer((client) => client.subscribe(channel)),
).pipe(Command.withDescription("Bring a channel's new top-level messages to the inbox."));

const unsubscribeCommand = Command.make("unsubscribe", { channel: channelArgument }, ({ channel }) =>
  answer((client) => client.unsubscribe(channel)),
).pipe(Command.withDescription("Stop a channel's new top-level messages reaching the inbox."));

export const verbCommands = [
  identityCommand,
  channelCommand,
  messageCommand,
  threadCommand,
  joinCommand,
  leaveCommand,
  inboxCommand,
  ackCommand,
  keepCommand,
  unreadCommand,
  reactCommand,
  unreactCommand,
  followCommand,
  unfollowCommand,
  subscribeCommand,
  unsubscribeCommand,
  commandCommand,
  helpCommand,
] as const;
