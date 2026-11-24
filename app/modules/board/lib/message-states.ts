import type { Failure, PostState } from "./failure.ts";
import type { MessageId, ReadPosition } from "../../sdk/index.ts";
import type { CallState } from "./command-call.ts";

type OlderState = { readonly status: "idle" } | { readonly status: "loading" } | Failure;

type ReadState =
  | { readonly status: "none" }
  | { readonly status: "acking" }
  | { readonly status: "acked"; readonly readPosition: ReadPosition }
  | Failure;

interface PageLoaded {
  readonly status: "loaded";
  readonly ids: readonly MessageId[];
  readonly hasMore: boolean;
  readonly older: OlderState;
  readonly read: ReadState;
  readonly call: CallState;
  readonly callData: string;
  readonly post: PostState;
  readonly expanded: ReadonlyMap<MessageId, number>;
}

type PageState = { readonly status: "loading" } | Failure | PageLoaded;

interface ThreadLoaded {
  readonly status: "loaded";
  readonly parent: MessageId;
  readonly replies: readonly MessageId[];
  readonly read: ReadState;
  readonly reply: PostState;
}

type ThreadState = { readonly status: "loading" } | Failure | ThreadLoaded;

type BeforeState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly id: MessageId | null }
  | Failure;

const LOADING = { status: "loading" } as const;

export {
  type BeforeState,
  LOADING,
  type PageLoaded,
  type PageState,
  type ReadState,
  type ThreadLoaded,
  type ThreadState,
};
