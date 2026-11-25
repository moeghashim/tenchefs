import type { ChannelName, CookoutClient, IdentityName, InboxItem, Message, TopLevelMessage } from "../../sdk/index.ts";
import {
  agentSessions,
  calledTrigger,
  channelList,
  channelPage,
  commandList,
  earlierOf,
  identityList,
  inboxOf,
  presences,
  reactionsOf,
  subscribedChannels,
  threadOf,
} from "../index.ts";
import type { BoardState } from "../index.ts";

interface Board {
  readonly channel: ChannelName;
  readonly reader: CookoutClient;
  readonly readerName: IdentityName;
  readonly agent: CookoutClient;
  readonly agentName: IdentityName;
  readonly parent: TopLevelMessage;
  readonly own: Message;
}

type Seen = Readonly<Record<string, unknown>>;

interface Items {
  readonly channel: ChannelName;
  readonly items: readonly InboxItem[];
}

interface InChannel {
  readonly channel: ChannelName;
  readonly state: BoardState;
}

interface OnBoard {
  readonly board: Board;
  readonly state: BoardState;
}

function ours(board: Board, names: readonly string[]): readonly string[] {
  return names.filter((name) => name.startsWith(board.channel));
}

function itemsIn({ channel, items }: Items): readonly unknown[] {
  const mine = items.filter((item) => item.message.channel === channel);
  return mine.map((item) => [item.message.id, item.reasons]);
}

function forYouIn({ channel, state }: InChannel): unknown {
  const inbox = inboxOf(state);
  if (inbox.status !== "loaded") {
    return inbox.status;
  }
  return itemsIn({ channel, items: inbox.items });
}

function earlierIn({ channel, state }: InChannel): unknown {
  const earlier = earlierOf(state);
  if (earlier.status !== "loaded") {
    return earlier.status;
  }
  return itemsIn({ channel, items: earlier.items });
}

function reacted(state: BoardState, message: Message): unknown {
  return [message.id, message.text, reactionsOf({ message, state })];
}

function pageIn(state: BoardState, board: Board): unknown {
  const page = channelPage(board.channel)(state);
  if (page.status !== "loaded") {
    return page.status;
  }
  return page.messages.map((message) => reacted(state, message));
}

function threadIn(state: BoardState, board: Board): unknown {
  const thread = threadOf({ channel: board.channel, id: board.parent.id })(state);
  if (thread.status !== "loaded") {
    return thread.status;
  }
  return [thread.parent, ...thread.replies].map((message) => reacted(state, message));
}

function channelsIn(state: BoardState, board: Board): unknown {
  const channels = channelList(state);
  if (channels.status !== "loaded") {
    return channels.status;
  }
  return ours(
    board,
    channels.channels.map(({ name }) => name),
  );
}

function commandsIn(state: BoardState, board: Board): unknown {
  const commands = commandList(state);
  if (commands.status !== "loaded") {
    return commands.status;
  }
  return ours(
    board,
    commands.commands.map(({ name }) => name),
  );
}

function subscriptionsIn(state: BoardState, board: Board): unknown {
  const subscriptions = subscribedChannels(state);
  if (subscriptions.status !== "loaded") {
    return subscriptions.status;
  }
  return ours(board, subscriptions.channels);
}

function sessionsIn(state: BoardState, board: Board): unknown {
  const sessions = agentSessions(board.agentName)(state);
  if (sessions === null) {
    return null;
  }
  return sessions.map((session) => session.host);
}

function presenceIn(state: BoardState, board: Board): unknown {
  const presence = presences(state).get(board.agentName) ?? null;
  if (presence === null) {
    return null;
  }
  return presence.online;
}

function boardIn({ board, state }: OnBoard): Seen {
  return {
    agentSessions: sessionsIn(state, board),
    channels: channelsIn(state, board),
    commands: commandsIn(state, board),
    earlier: earlierIn({ channel: board.channel, state }),
    forYou: forYouIn({ channel: board.channel, state }),
    identities: identityList(state).filter(({ name }) => name.startsWith(board.channel)),
    page: pageIn(state, board),
    presence: presenceIn(state, board),
    session: state.session,
    subscriptions: subscriptionsIn(state, board),
    thread: threadIn(state, board),
    trigger: calledTrigger(board.agentName)(state),
  };
}

function loaded({ agentSessions: sessions, presence, ...rest }: Seen): boolean {
  const seen = JSON.stringify(rest);
  return sessions !== null && presence !== null && !seen.includes('"loading"') && !seen.includes('"checking"');
}

export { type Board, boardIn, forYouIn, itemsIn, loaded, type Seen };
