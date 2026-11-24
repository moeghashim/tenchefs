import type { BoardStore } from "../../board/index.ts";
import type { ReactNode } from "react";
import { ReactionList } from "./reaction-list.ts";

interface ReactingProps {
  readonly boardStore: BoardStore;
  readonly children: ReactNode;
}

export function Reacting(props: ReactingProps): ReactNode {
  return <ReactionList value={props.boardStore}>{props.children}</ReactionList>;
}
