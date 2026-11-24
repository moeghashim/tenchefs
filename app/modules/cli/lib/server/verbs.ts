import { Argument, Command, Flag } from "effect/cli";
import { approveJoinCommand, joinCommand, leaveCommand } from "./join-command.ts";
import {
  beforeFlag,
  channelArgument,
  limitFlag,
  messageCommand,
  messageIdArgument,
  pageQuery,
  scheduleCommand,
} from "./message-command.ts";
import { identityCommand, keepCommand } from "./identity.ts";
import { searchCommand, threadCommandFor } from "./thread.ts";
import { Option } from "effect";
import { answer } from "./output.ts";
import { assetCommand } from "./attachments.ts";
import { commandCommand } from "./command.ts";
import { helpCommand } from "./help-monitor.ts";

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
  assetCommand,
  threadCommand,
  searchCommand,
  joinCommand,
  leaveCommand,
  approveJoinCommand,
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
  scheduleCommand,
  commandCommand,
  helpCommand,
] as const;
