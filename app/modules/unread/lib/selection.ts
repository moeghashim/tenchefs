import type { ChannelName, InboxItem, Message, MessageId } from "../../sdk/index.ts";

const NONE = 0;

interface SelectionState {
  readonly items: readonly InboxItem[];
  readonly expanded: boolean;
  readonly replyPost: Message | null;
}

interface Selection {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => SelectionState;
  readonly expand: () => void;
  readonly chooseReplyPost: (post: Message) => void;
}

interface Scope {
  readonly channel: ChannelName;
  readonly thread: MessageId | null;
}

interface ItemsStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () =>
    | { readonly status: "loaded"; readonly items: readonly InboxItem[] }
    | { readonly status: string };
}

const EMPTY: SelectionState = { expanded: false, items: [], replyPost: null };

function inThread(item: InboxItem, thread: MessageId | null): boolean {
  if (thread === null) {
    return item.message.kind === "top-level" && !item.reasons.includes("reaction");
  }
  return item.message.kind === "reply" && item.parent.id === thread;
}

function inScope(item: InboxItem, scope: Scope | null): boolean {
  return scope !== null && item.channel.name === scope.channel && inThread(item, scope.thread);
}

function joined(kept: readonly InboxItem[], unread: readonly InboxItem[]): readonly InboxItem[] {
  const fresh = unread.filter((item) => !kept.some((each) => each.message.id === item.message.id));
  return [...kept, ...fresh].toSorted((first, second) => first.message.id - second.message.id);
}

function idsOf(items: readonly InboxItem[]): string {
  return items.map((item) => String(item.message.id)).join(" ");
}

function unreadIn(store: ItemsStore, scope: Scope | null): readonly InboxItem[] {
  const state = store.snapshot();
  if (!("items" in state)) {
    return [];
  }
  return state.items.filter((item) => inScope(item, scope));
}

function createSelection(store: ItemsStore, scope: Scope | null): Selection {
  const listeners = new Set<() => void>();
  let state = EMPTY;
  let stop: (() => void) | null = null;

  function publish(next: SelectionState): void {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function take(): void {
    const items = joined(state.items, unreadIn(store, scope));
    if (items.length > NONE && idsOf(items) !== idsOf(state.items)) {
      publish({ ...state, items });
    }
  }

  return {
    chooseReplyPost: (post) => {
      if (JSON.stringify(state.replyPost) !== JSON.stringify(post)) {
        publish({ ...state, replyPost: post });
      }
    },
    expand: () => {
      if (!state.expanded) {
        publish({ ...state, expanded: true });
      }
    },
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      stop ??= store.subscribe(take);
      take();
      return () => {
        listeners.delete(listener);
        if (listeners.size === NONE && stop !== null) {
          stop();
          stop = null;
          state = EMPTY;
        }
      };
    },
  };
}

function keyOf(scope: Scope | null): string {
  if (scope === null) {
    return "";
  }
  return `${scope.channel}/${String(scope.thread)}`;
}

function createSelections(store: ItemsStore): (scope: Scope | null) => Selection {
  const selections = new Map<string, Selection>();
  return (scope) => {
    const key = keyOf(scope);
    const selection = selections.get(key) ?? createSelection(store, scope);
    selections.set(key, selection);
    return selection;
  };
}

export { type Selection, createSelections };
