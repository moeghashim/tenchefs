import type { ChannelName, MessageId } from "../../sdk/index.ts";
import { createSelections } from "./selection.ts";

const NONE = 0;

interface Scope {
  readonly channel: ChannelName;
  readonly thread: MessageId | null;
}

type LineOf = (channel: ChannelName, thread: MessageId | null) => number | null;

type MovesBackOf = (channel: ChannelName, thread: MessageId | null) => number;

interface CountsStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => { readonly status: string };
}

type WithNewLines<Store> = Omit<Store, "heard" | "lineAt" | "movesBack"> & {
  readonly newLine: (channel: ChannelName, thread: MessageId | null) => NewLine;
  readonly selection: ReturnType<typeof createSelections>;
};

interface NewLine {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => number | null;
}

interface Lining {
  readonly counts: CountsStore;
  readonly heard: CountsStore["subscribe"];
  readonly lineAt: LineOf;
  readonly movesBack: MovesBackOf;
  readonly scope: Scope;
}

function createNewLine({ counts, heard, lineAt, movesBack, scope }: Lining): NewLine {
  const listeners = new Set<() => void>();
  let line: number | null = null;
  let taken = false;
  let moves = NONE;
  let stop: (() => void) | null = null;

  function put(next: number | null): void {
    if (next === line) {
      return;
    }
    line = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function take(): void {
    const movedBack = movesBack(scope.channel, scope.thread);
    if ((taken && moves === movedBack) || counts.snapshot().status !== "loaded") {
      return;
    }
    taken = true;
    moves = movedBack;
    put(lineAt(scope.channel, scope.thread));
  }

  return {
    snapshot: () => line,
    subscribe: (listener) => {
      listeners.add(listener);
      stop ??= heard(take);
      take();
      return () => {
        listeners.delete(listener);
        if (listeners.size === NONE && stop !== null) {
          stop();
          stop = null;
          taken = false;
          line = null;
        }
      };
    },
  };
}

type Lines<Store> = Store & {
  readonly heard: CountsStore["subscribe"];
  readonly lineAt: LineOf;
  readonly movesBack: MovesBackOf;
};

function withNewLines<Store extends CountsStore>({
  heard,
  lineAt,
  movesBack,
  ...counts
}: Lines<Store>): WithNewLines<Lines<Store>> {
  const lines = new Map<string, NewLine>();
  return {
    ...counts,
    newLine: (channel, thread) => {
      const key = `${channel}/${String(thread)}`;
      const line = lines.get(key) ?? createNewLine({ counts, heard, lineAt, movesBack, scope: { channel, thread } });
      lines.set(key, line);
      return line;
    },
    selection: createSelections(counts),
  };
}

export { withNewLines };
export type { NewLine, WithNewLines };
