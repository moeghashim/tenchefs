import type { IdentityName, ListedAgentSession, Refusal, Token } from "../../sdk/index.ts";
import type { IdentityList } from "./identity-list.ts";
import { agentSessions } from "../../board/index.ts";
import { listenersOf } from "./listeners.ts";
import { refusalOf } from "../../sdk/index.ts";

type IdentityAction = "deactivate" | "delete" | "reactivate" | "revoke" | "rotate" | "transfer";

type ActionState =
  | { readonly status: "idle" }
  | { readonly status: "sending"; readonly action: IdentityAction }
  | (Refusal & { readonly status: "failed"; readonly action: IdentityAction });

type MessageCount = number | "loading" | "unknown";

interface IdentityActionsSnapshot {
  readonly action: ActionState;
  readonly confirming: IdentityAction | null;
  readonly messages: MessageCount;
  readonly sessions: readonly ListedAgentSession[] | null;
  readonly token: Token | null;
  readonly transferTo: string;
}

interface IdentityActions {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => IdentityActionsSnapshot;
  readonly subscribeToSessions: (listener: () => void) => () => void;
  readonly subscribeToMessages: (listener: () => void) => () => void;
  readonly ask: Readonly<Record<IdentityAction, () => void>>;
  readonly cancel: () => void;
  readonly confirm: () => void;
  readonly editTransfer: (text: string) => void;
  readonly forgetToken: () => void;
  readonly copyToken: () => void;
  readonly showToken: (token: Token) => void;
}

interface IdentityActionsOptions {
  readonly list: IdentityList;
  readonly name: IdentityName;
}

type Held = Omit<IdentityActionsSnapshot, "sessions">;

type Sent = Partial<Omit<Held, "action">>;

type Sends = Readonly<Record<IdentityAction, () => Promise<Sent>>>;

const IDLE = { status: "idle" } as const;

const START: Held = {
  action: IDLE,
  confirming: null,
  messages: "loading",
  token: null,
  transferTo: "",
};

function sendsFor({ list, name }: IdentityActionsOptions, transferTo: () => string): Sends {
  const { calls } = list;
  return {
    deactivate: async () => {
      await calls.deactivate(name);
      return { token: null };
    },
    delete: async () => {
      await calls.delete(name);
      return { token: null };
    },
    reactivate: async () => ({ token: await calls.reactivate(name) }),
    revoke: async () => {
      await calls.revokeSession(name);
      return {};
    },
    rotate: async () => ({ token: await calls.rotateToken(name) }),
    transfer: async () => {
      await calls.transfer(name, transferTo().trim());
      return { transferTo: "" };
    },
  };
}

type Publish = (next: Partial<Held>) => void;

type Edits = Pick<IdentityActions, "editTransfer" | "forgetToken" | "showToken">;

function editsOf(publish: Publish): Edits {
  return {
    editTransfer: (transferTo) => {
      publish({ transferTo });
    },
    forgetToken: () => {
      publish({ token: null });
    },
    showToken: (token) => {
      publish({ token });
    },
  };
}

function asksOf(publish: Publish): IdentityActions["ask"] {
  function askTo(action: IdentityAction): () => void {
    return () => {
      publish({ action: IDLE, confirming: action });
    };
  }
  return {
    deactivate: askTo("deactivate"),
    delete: askTo("delete"),
    reactivate: askTo("reactivate"),
    revoke: askTo("revoke"),
    rotate: askTo("rotate"),
    transfer: askTo("transfer"),
  };
}

function cancelOf(publish: Publish, snapshot: () => Held): () => void {
  return () => {
    if (snapshot().action.status !== "sending") {
      publish({ confirming: null });
    }
  };
}

async function copyAfter(previous: Promise<void>, token: Token | null): Promise<void> {
  await previous;
  if (token !== null) {
    await globalThis.navigator.clipboard.writeText(token);
  }
}

async function messagesOf(options: IdentityActionsOptions, publish: Publish): Promise<void> {
  try {
    publish({ messages: await options.list.calls.countMessages(options.name) });
  } catch {
    publish({ messages: "unknown" });
  }
}

type Subscribe = (listener: () => void) => () => void;

interface Loading {
  readonly add: Subscribe;
  readonly options: IdentityActionsOptions;
  readonly publish: Publish;
}

function loadingOnFirst(load: typeof messagesOf, { add, options, publish }: Loading): Subscribe {
  let loading: Promise<void> | null = null;
  return (listener) => {
    loading ??= load(options, publish);
    return add(listener);
  };
}

interface Shown {
  readonly held: Held;
  readonly sessions: IdentityActionsSnapshot["sessions"];
  readonly snapshot: IdentityActionsSnapshot;
}

function shownOf({ list, name }: IdentityActionsOptions, held: () => Held): () => IdentityActionsSnapshot {
  const sessionsIn = agentSessions(name);
  let shown: Shown | null = null;
  return () => {
    const sessions = sessionsIn(list.store.snapshot());
    if (shown === null || shown.held !== held() || shown.sessions !== sessions) {
      shown = { held: held(), sessions, snapshot: { ...held(), sessions } };
    }
    return shown.snapshot;
  };
}

function joined(first: Subscribe, second: Subscribe): Subscribe {
  return (listener) => {
    const stopFirst = first(listener);
    const stopSecond = second(listener);
    return () => {
      stopFirst();
      stopSecond();
    };
  };
}

function createIdentityActions(options: IdentityActionsOptions): IdentityActions {
  const listeners = listenersOf(options.list.show);
  let current = START;
  let queue = Promise.resolve();
  let copying = Promise.resolve();
  const sends = sendsFor(options, () => current.transferTo);

  function publish(next: Partial<Held>): void {
    current = { ...current, ...next };
    listeners.notify();
  }

  async function runAfter(previous: Promise<void>, action: IdentityAction): Promise<void> {
    await previous;
    publish({ action: { action, status: "sending" } });
    try {
      publish({ ...(await sends[action]()), action: IDLE, confirming: null });
    } catch (error: unknown) {
      publish({ action: { ...refusalOf(error), action, status: "failed" } });
    }
  }

  const { store } = options.list;
  const add = joined(store.subscribe, listeners.add);

  return {
    ...editsOf(publish),
    ask: asksOf(publish),
    cancel: cancelOf(publish, () => current),
    confirm: () => {
      const action = current.confirming;
      if (action !== null) {
        queue = runAfter(queue, action);
      }
    },
    copyToken: () => {
      copying = copyAfter(copying, current.token);
    },
    snapshot: shownOf(options, () => current),
    subscribe: add,
    subscribeToMessages: loadingOnFirst(messagesOf, { add, options, publish }),
    subscribeToSessions: joined(store.subscribeShowingSessions(options.name), listeners.add),
  };
}

export { type IdentityAction, type IdentityActions, type MessageCount, createIdentityActions };
