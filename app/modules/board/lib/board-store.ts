import type {
  AgentSessions,
  Identities,
  IdentityCalls,
  IdentityParts,
  IdentityPartsClient,
  SessionState,
} from "./identity-parts.ts";
import type { CalledPart, CalledTriggers } from "./triggers-slice.ts";
import type { FollowedLive, Linked } from "./live-following.ts";
import type { IdentityName, Refusal } from "../../sdk/index.ts";
import type { InboxCalls, InboxCallsClient, InboxHeld, InboxParts } from "./inbox-part.ts";
import type { OwnClient, OwnShowing, OwnState } from "./own-showing.ts";
import type { PresenceClient, Presences } from "./presence-slice.ts";
import type { ReactionParts, Reactions, ReactionsClient, Toggle, ToggleClient } from "./reaction-parts.ts";
import { followerOf, linkedTo } from "./live-following.ts";
import type { Part } from "./slice.ts";
import { createCalledTriggers } from "./triggers-slice.ts";
import { createListeners } from "./listeners.ts";
import { createOwn } from "./own-showing.ts";
import { createPart } from "./slice.ts";
import { identityPartsOf } from "./identity-parts.ts";
import { inboxPartsOf } from "./inbox-part.ts";
import { presenceSlice } from "./presence-slice.ts";
import { reactionPartsOf } from "./reaction-parts.ts";

interface BoardState extends OwnState, InboxHeld {
  readonly presence: Presences;
  readonly triggers: CalledTriggers;
  readonly reactions: Reactions;
  readonly reactionRefusal: Refusal | null;
  readonly identities: Identities;
  readonly agentSessions: AgentSessions;
  readonly session: SessionState;
}

type Shown =
  | "channels"
  | "webhookCommands"
  | "identities"
  | "inbox"
  | "presence"
  | "reactions"
  | "schedules"
  | "session"
  | "subscriptions"
  | "triggers";

type Subscribe = (listener: () => void) => () => void;

interface BoardStore extends OwnShowing, Linked {
  readonly subscribe: Subscribe;
  readonly snapshot: () => BoardState;
  readonly subscribeShowing: (shown: Shown) => Subscribe;
  readonly toggle: (toggle: Toggle) => void;
  readonly subscribeShowingSessions: (agent: IdentityName) => Subscribe;
  readonly identityCalls: IdentityCalls;
  readonly inboxCalls: InboxCalls;
  readonly logIn: (token: string) => void;
  readonly session: Session;
}

interface Session {
  readonly subscribe: Subscribe;
  readonly snapshot: () => SessionState;
  readonly logIn: (token: string) => void;
  readonly logOut: () => void;
}

type BoardStoreClient = OwnClient &
  IdentityPartsClient &
  InboxCallsClient &
  PresenceClient &
  ReactionsClient &
  ToggleClient;

interface BoardStoreOptions {
  readonly client: BoardStoreClient;
  readonly url: string;
  readonly live: FollowedLive;
  readonly pageSize?: number;
}

const PAGE_SIZE = 50;

interface Showing {
  readonly part: Pick<Part<unknown>, "hide" | "show">;
  readonly follow: () => void;
  readonly subscribe: Subscribe;
}

function showingUnfollowed({ part, subscribe }: Omit<Showing, "follow">): Subscribe {
  return (listener) => {
    const unsubscribe = subscribe(listener);
    part.show();
    return () => {
      unsubscribe();
      part.hide();
    };
  };
}

function followedOnly(follow: () => void, subscribe: Subscribe): Subscribe {
  return (listener) => {
    follow();
    return subscribe(listener);
  };
}

function showing({ follow, part, subscribe }: Showing): Subscribe {
  const shown = showingUnfollowed({ part, subscribe });
  return (listener) => {
    follow();
    return shown(listener);
  };
}

function sessionsShowing(
  follow: () => void,
  part: IdentityParts["sessions"],
  subscribe: Subscribe,
): (agent: IdentityName) => Subscribe {
  const subscribers = new Map<IdentityName, Subscribe>();
  return (agent) => {
    const found =
      subscribers.get(agent) ??
      showing({
        follow,
        part: {
          hide: () => {
            part.hide(agent);
          },
          show: () => {
            part.show(agent);
          },
        },
        subscribe,
      });
    subscribers.set(agent, found);
    return found;
  };
}

interface Parts extends IdentityParts, ReactionParts, InboxParts {
  readonly presence: Part<Presences>;
  readonly triggers: CalledPart;
  readonly own: ReturnType<typeof createOwn>;
}

function ackingAfter(client: OwnClient, inboxRead: () => Promise<void>): OwnClient {
  return {
    ...client,
    ack: async (id) => {
      await inboxRead();
      const acked = await client.ack(id);
      return acked;
    },
  };
}

function partsOf(changed: () => void, options: BoardStoreOptions): Parts {
  const { client, pageSize = PAGE_SIZE, url } = options;
  const inboxRead = Promise.withResolvers<() => Promise<void>>();
  const own = createOwn({
    changed,
    client: ackingAfter(client, async () => {
      const settled = await inboxRead.promise;
      await settled();
    }),
    pageSize,
  });
  const inbox = inboxPartsOf({ changed, client, keepItems: own.parts.messages.keepItems, pageSize });
  inboxRead.resolve(inbox.inbox.settled);
  return {
    ...reactionPartsOf({ changed, client }),
    ...identityPartsOf({ changed, client, url }),
    ...inbox,
    own,
    presence: createPart({ changed, client, slice: presenceSlice }),
    triggers: createCalledTriggers(changed),
  };
}

function followOf(parts: Parts, live: FollowedLive): () => void {
  const { identities, own, presence, reactions, session, sessions, triggers } = parts;
  return followerOf({
    live,
    parts: [own.parts, presence, reactions, identities, sessions, triggers, parts.inboxFollowed],
    rereads: [session.back],
  });
}

function sessionCalls({ logIn, logOut }: Pick<Session, "logIn" | "logOut">): Pick<Session, "logIn" | "logOut"> {
  return { logIn, logOut };
}

function createBoardStore(options: BoardStoreOptions): BoardStore {
  const { notify, subscribe } = createListeners();
  let snapshot: BoardState | null = null;
  function changed(): void {
    snapshot = null;
    notify();
  }
  const parts = partsOf(changed, options);
  const { identities, identityCalls, own, presence, reactionToggle, reactions, session, sessions, triggers } = parts;
  const follow = followOf(parts, options.live);
  const subscribers = {
    ...own.subscribers({ follow, subscribe }),
    identities: showing({ follow, part: identities, subscribe }),
    inbox: showing({ follow, part: parts.inbox, subscribe }),
    presence: showing({ follow, part: presence, subscribe }),
    reactions: showing({ follow, part: reactions, subscribe }),
    session: showingUnfollowed({ part: session, subscribe }),
    triggers: followedOnly(follow, subscribe),
  };
  function snapshotOf(): BoardState {
    snapshot ??= {
      ...own.state(),
      agentSessions: sessions.state(),
      identities: identities.state(),
      ...parts.inboxHeld(),
      presence: presence.state(),
      reactionRefusal: reactionToggle.refusal(),
      reactions: reactions.state(),
      session: session.shown(identities.state()),
      triggers: triggers.state(),
    };
    return snapshot;
  }
  return {
    ...own.showing({ follow, subscribe }),
    ...linkedTo(options.live),
    identityCalls,
    inboxCalls: parts.inboxCalls,
    logIn: session.logIn,
    session: { ...sessionCalls(session), snapshot: () => snapshotOf().session, subscribe: subscribers.session },
    snapshot: snapshotOf,
    subscribe,
    subscribeShowing: (shown) => subscribers[shown],
    subscribeShowingSessions: sessionsShowing(follow, sessions, subscribe),
    toggle: reactionToggle.toggle,
  };
}

export type { IdentityCalls } from "./identity-parts.ts";
export { type BoardState, type BoardStore, type Session, createBoardStore };
export type { Presences } from "./presence-slice.ts";
