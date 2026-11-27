import type { LogOutEverywhereCounts, PublicId, SessionView } from "../../logins/index.ts";
import type { Refusal } from "../../sdk/index.ts";
import { refusalOf } from "../../sdk/index.ts";

type SessionAsk =
  | { readonly kind: "revoke"; readonly session: SessionView }
  | { readonly kind: "everywhere"; readonly willEnd: LogOutEverywhereCounts };

type SessionAction =
  | { readonly status: "idle" }
  | { readonly status: "sending" }
  | (Refusal & { readonly status: "failed" });

interface SessionListState {
  readonly sessions: readonly SessionView[] | null;
  readonly asked: SessionAsk | null;
  readonly action: SessionAction;
}

interface SessionListCalls {
  readonly listSessions: () => Promise<readonly SessionView[]>;
  readonly revokeSession: (id: PublicId) => Promise<void>;
  readonly previewLogOutEverywhere: () => Promise<LogOutEverywhereCounts>;
  readonly logOutEverywhere: () => Promise<void>;
}

interface SessionList {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => SessionListState;
  readonly askRevoke: (session: SessionView) => void;
  readonly askLogOutEverywhere: () => void;
  readonly cancel: () => void;
  readonly confirm: () => void;
}

const NONE = 0;
const IDLE: SessionAction = { status: "idle" };
const SENDING: SessionAction = { status: "sending" };
const FIRST: SessionListState = { action: IDLE, asked: null, sessions: null };

async function after(previous: Promise<void>, step: () => Promise<void>): Promise<void> {
  await previous;
  await step();
}

interface Held {
  readonly current: () => SessionListState;
  readonly publish: (next: SessionListState) => void;
}

async function confirmed(calls: SessionListCalls, asked: SessionAsk): Promise<void> {
  if (asked.kind === "revoke") {
    await calls.revokeSession(asked.session.id);
    return;
  }
  await calls.logOutEverywhere();
}

interface Steps {
  readonly askLogOutEverywhere: () => Promise<void>;
  readonly confirm: () => Promise<void>;
  readonly load: () => Promise<void>;
}

function stepsOf(calls: SessionListCalls, { current, publish }: Held): Steps {
  async function load(): Promise<void> {
    try {
      const sessions = await calls.listSessions();
      publish({ ...current(), sessions });
    } catch (error: unknown) {
      publish({ ...current(), action: { ...refusalOf(error), status: "failed" } });
    }
  }
  return {
    askLogOutEverywhere: async () => {
      publish({ ...current(), action: SENDING });
      try {
        const willEnd = await calls.previewLogOutEverywhere();
        publish({ ...current(), action: IDLE, asked: { kind: "everywhere", willEnd } });
      } catch (error: unknown) {
        publish({ ...current(), action: { ...refusalOf(error), status: "failed" } });
      }
    },
    confirm: async () => {
      const { asked } = current();
      if (asked === null) {
        return;
      }
      publish({ ...current(), action: SENDING });
      try {
        await confirmed(calls, asked);
        publish({ ...current(), action: IDLE, asked: null });
        await load();
      } catch (error: unknown) {
        publish({ ...current(), action: { ...refusalOf(error), status: "failed" } });
      }
    },
    load,
  };
}

function createSessionList(calls: SessionListCalls): SessionList {
  const listeners = new Set<() => void>();
  let current = FIRST;
  let queue = Promise.resolve();
  function publish(next: SessionListState): void {
    current = next;
    for (const listener of listeners) {
      listener();
    }
  }
  const steps = stepsOf(calls, { current: () => current, publish });
  function queued(step: () => Promise<void>): () => void {
    return () => {
      queue = after(queue, step);
    };
  }
  return {
    askLogOutEverywhere: queued(steps.askLogOutEverywhere),
    askRevoke: (session) => {
      publish({ ...current, action: IDLE, asked: { kind: "revoke", session } });
    },
    cancel: () => {
      publish({ ...current, action: IDLE, asked: null });
    },
    confirm: queued(steps.confirm),
    snapshot: () => current,
    subscribe: (listener) => {
      if (listeners.size === NONE) {
        queued(steps.load)();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type SessionAsk, type SessionList, type SessionListCalls, type SessionListState, createSessionList };
