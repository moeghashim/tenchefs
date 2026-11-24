import type { CookoutClient, Identity, Refusal } from "../../sdk/index.ts";
import { createCookoutClient, refusalOf } from "../../sdk/index.ts";
import type { Identities } from "./identities-slice.ts";

type SessionState =
  | { readonly status: "checking" }
  | { readonly status: "logged-out"; readonly refusal: Refusal | null }
  | { readonly status: "logging-in" }
  | { readonly status: "logged-in"; readonly identity: Identity };

type SessionClient = Pick<CookoutClient, "whoami">;

interface SessionPart {
  readonly show: () => void;
  readonly hide: () => void;
  readonly back: () => void;
  readonly logIn: (token: string) => void;
  readonly shown: (identities: Identities) => SessionState;
}

interface SessionPartOptions {
  readonly client: SessionClient;
  readonly url: string;
  readonly changed: () => void;
}

interface Answers {
  readonly check: () => Promise<void>;
  readonly logIn: (token: string) => Promise<void>;
}

interface Held {
  readonly state: () => SessionState;
  readonly put: (next: SessionState) => void;
}

interface Seen {
  readonly session: SessionState;
  readonly held: Identity | null;
  readonly shown: SessionState;
}

const NONE = 0;
const ONE = 1;
const NOT_LOGGED_IN = "token_missing";
const UNREACHABLE = "unreachable";
const CHECKING: SessionState = { status: "checking" };

function shownRefusal(refusal: Refusal): Refusal | null {
  if (refusal.code === NOT_LOGGED_IN) {
    return null;
  }
  return refusal;
}

async function after(previous: Promise<void> | null, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

function answersOf(held: Held, { client, url }: Omit<SessionPartOptions, "changed">): Answers {
  return {
    check: async () => {
      try {
        const { identity } = await client.whoami();
        held.put({ identity, status: "logged-in" });
      } catch (error: unknown) {
        const refusal = refusalOf(error);
        if (held.state().status !== "logged-in" || refusal.code !== UNREACHABLE) {
          held.put({ refusal: shownRefusal(refusal), status: "logged-out" });
        }
      }
    },
    logIn: async (token) => {
      held.put({ status: "logging-in" });
      try {
        const { identity } = await createCookoutClient({ env: {}, token, url }).login();
        held.put({ identity, status: "logged-in" });
      } catch (error: unknown) {
        held.put({ refusal: refusalOf(error), status: "logged-out" });
      }
    },
  };
}

function heldFor(session: SessionState, identities: Identities): Identity | null {
  if (session.status !== "logged-in") {
    return null;
  }
  return identities.listed.find((identity) => identity.name === session.identity.name) ?? null;
}

function shownOf(session: SessionState, held: Identity | null): SessionState {
  if (held === null) {
    return session;
  }
  return { identity: held, status: "logged-in" };
}

function loggedInOf(state: () => SessionState): (identities: Identities) => SessionState {
  let seen: Seen = { held: null, session: state(), shown: state() };
  return (identities) => {
    const session = state();
    const held = heldFor(session, identities);
    if (seen.session !== session || seen.held !== held) {
      seen = { held, session, shown: shownOf(session, held) };
    }
    return seen.shown;
  };
}

function createSessionPart(options: SessionPartOptions): SessionPart {
  let current = CHECKING;
  let readers = NONE;
  let queue: Promise<void> | null = null;
  const held: Held = {
    put: (next) => {
      current = next;
      options.changed();
    },
    state: () => current,
  };
  const { check, logIn } = answersOf(held, options);
  return {
    back: () => {
      if (readers > NONE) {
        queue = after(queue, check);
      }
    },
    hide: () => {
      readers -= ONE;
    },
    logIn: (token) => {
      queue = after(queue ?? check(), async () => {
        await logIn(token);
      });
    },
    show: () => {
      readers += ONE;
      queue ??= check();
    },
    shown: loggedInOf(held.state),
  };
}

export { type SessionClient, type SessionPart, type SessionState, createSessionPart };
