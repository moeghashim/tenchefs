import type { MessageId, TopLevelMessage } from "../../sdk/index.ts";

const SHOWN_A_CLICK = 10;
const NONE = 0;
const ONE = 1;

interface Fold {
  readonly kind: "fold";
  readonly run: readonly MessageId[];
  readonly label: string;
}

interface Shown {
  readonly kind: "message";
  readonly message: TopLevelMessage;
  readonly afterFold: boolean;
}

type FeedPart = Fold | Shown;

interface Folding {
  readonly messages: readonly TopLevelMessage[];
  readonly expanded: ReadonlyMap<MessageId, number>;
  readonly held: ReadonlySet<MessageId>;
}

interface Unfolding {
  readonly run: readonly MessageId[];
  readonly expanded: ReadonlyMap<MessageId, number>;
}

interface Holding {
  readonly message: TopLevelMessage;
  readonly held: ReadonlySet<MessageId>;
}

function isFolded({ held, message }: Holding): boolean {
  return "closedAt" in message && !held.has(message.id);
}

function runsOf({ held, messages }: Folding): readonly (readonly TopLevelMessage[])[] {
  const runs: TopLevelMessage[][] = [];
  let run: TopLevelMessage[] = [];
  let previous: TopLevelMessage | null = null;
  for (const message of messages) {
    if (previous === null || !isFolded({ held, message }) || !isFolded({ held, message: previous })) {
      run = [];
      runs.push(run);
    }
    run.push(message);
    previous = message;
  }
  return runs;
}

function shownOf({ expanded, run }: Unfolding): number {
  return Math.min(run.length, Math.max(NONE, ...run.map((id) => expanded.get(id) ?? NONE)));
}

function countLabel(count: number): string {
  if (count === ONE) {
    return "1 closed thread";
  }
  return `${String(count)} closed threads`;
}

function foldLabel(run: readonly MessageId[], shown: number): string {
  if (shown === NONE) {
    return countLabel(run.length);
  }
  return `${String(Math.min(SHOWN_A_CLICK, run.length - shown))} more`;
}

function messagesOf(run: readonly TopLevelMessage[]): readonly Shown[] {
  return run.map((message) => ({ afterFold: false, kind: "message", message }));
}

function partsOfRun(run: readonly TopLevelMessage[], { expanded, held }: Folding): readonly FeedPart[] {
  if (!run.some((message) => isFolded({ held, message }))) {
    return messagesOf(run);
  }
  const ids = run.map((message) => message.id);
  const shown = shownOf({ expanded, run: ids });
  if (shown === run.length) {
    return messagesOf(run);
  }
  return [{ kind: "fold", label: foldLabel(ids, shown), run: ids }, ...messagesOf(run.slice(run.length - shown))];
}

function afterFoldOf(part: FeedPart, afterFold: boolean): FeedPart {
  if (part.kind === "fold" || !afterFold) {
    return part;
  }
  return { ...part, afterFold };
}

function foldClosed(folding: Folding): readonly FeedPart[] {
  const parts: FeedPart[] = [];
  let afterFold = false;
  for (const run of runsOf(folding)) {
    for (const part of partsOfRun(run, folding)) {
      parts.push(afterFoldOf(part, afterFold));
      afterFold = part.kind === "fold";
    }
  }
  return parts;
}

function shownAfterClick(unfolding: Unfolding): number {
  return shownOf(unfolding) + SHOWN_A_CLICK;
}

export { type FeedPart, type Fold, foldClosed, shownAfterClick };
