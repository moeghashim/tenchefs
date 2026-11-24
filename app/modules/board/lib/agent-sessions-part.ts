import type { CookoutClient, CookoutEvent, IdentityName, ListedAgentSession } from "../../sdk/index.ts";
import { everySecond, isPast } from "../../format/index.ts";

const NONE = 0;
const ONE = 1;

type Sessions = readonly ListedAgentSession[] | null;

type AgentSessions = ReadonlyMap<IdentityName, Sessions>;

type SessionsClient = Pick<CookoutClient, "listAgentSessions">;

interface SessionsPart {
  readonly state: () => AgentSessions;
  readonly apply: (event: CookoutEvent) => void;
  readonly back: () => void;
  readonly show: (agent: IdentityName) => void;
  readonly hide: (agent: IdentityName) => void;
  readonly put: (agent: IdentityName, sessions: Sessions) => void;
}

interface SessionsPartOptions {
  readonly client: SessionsClient;
  readonly changed: () => void;
}

interface Followed {
  readers: number;
  current: boolean;
  reading: Promise<void>;
  stopTicking: (() => void) | null;
}

interface Held {
  readonly state: () => AgentSessions;
  readonly put: (agent: IdentityName, sessions: Sessions) => void;
}

interface Reads {
  readonly followed: Map<IdentityName, Followed>;
  readonly followedOf: (agent: IdentityName) => Followed;
  readonly read: (agent: IdentityName) => void;
  readonly readAgain: (agent: IdentityName) => void;
}

const NOTHING: AgentSessions = new Map();
const NO_SESSIONS: readonly ListedAgentSession[] = [];

function concerned(event: CookoutEvent): IdentityName | null {
  if (event.type === "agent-session") {
    return event.agent;
  }
  if (event.type === "identity") {
    return event.identity.name;
  }
  return null;
}

async function listed(client: SessionsClient, agent: IdentityName): Promise<Sessions> {
  try {
    const { agentSessions } = await client.listAgentSessions(agent);
    return agentSessions;
  } catch {
    return null;
  }
}

function heldSessions(changed: () => void): Held {
  let state = NOTHING;
  return {
    put: (agent, sessions) => {
      if (state.has(agent) && JSON.stringify(state.get(agent)) === JSON.stringify(sessions)) {
        return;
      }
      state = new Map(state).set(agent, sessions);
      changed();
    },
    state: () => state,
  };
}

function readsOf(client: SessionsClient, held: Held): Reads {
  const followed = new Map<IdentityName, Followed>();

  function followedOf(agent: IdentityName): Followed {
    const found = followed.get(agent) ?? {
      current: false,
      readers: NONE,
      reading: Promise.resolve(),
      stopTicking: null,
    };
    followed.set(agent, found);
    return found;
  }

  async function readAfter(previous: Promise<void>, agent: IdentityName): Promise<void> {
    await previous;
    held.put(agent, await listed(client, agent));
  }

  function read(agent: IdentityName): void {
    const following = followedOf(agent);
    following.current = true;
    following.reading = readAfter(following.reading, agent);
  }

  return {
    followed,
    followedOf,
    read,
    readAgain: (agent) => {
      const following = followedOf(agent);
      following.current = false;
      if (following.readers > NONE) {
        read(agent);
      }
    },
  };
}

function expiredIn(held: Held, agent: IdentityName): boolean {
  const sessions = held.state().get(agent) ?? NO_SESSIONS;
  return sessions.some((session) => isPast(session.expiresAt));
}

function createSessionsPart({ changed, client }: SessionsPartOptions): SessionsPart {
  const held = heldSessions(changed);
  const { followed, followedOf, read, readAgain } = readsOf(client, held);
  return {
    apply: (event) => {
      const agent = concerned(event);
      if (agent !== null && followed.has(agent)) {
        readAgain(agent);
      }
    },
    back: () => {
      for (const agent of followed.keys()) {
        readAgain(agent);
      }
    },
    hide: (agent) => {
      const following = followedOf(agent);
      following.readers -= ONE;
      if (following.readers === NONE && following.stopTicking !== null) {
        following.stopTicking();
        following.stopTicking = null;
      }
    },
    put: held.put,
    show: (agent) => {
      const following = followedOf(agent);
      following.readers += ONE;
      following.stopTicking ??= everySecond(() => {
        if (expiredIn(held, agent)) {
          read(agent);
        }
      });
      if (!following.current) {
        read(agent);
      }
    },
    state: held.state,
  };
}

export { type AgentSessions, type Sessions, type SessionsClient, type SessionsPart, createSessionsPart };
