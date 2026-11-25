import { Announcer } from "./announcer.ts";
import { AuthorCards } from "./author-cards.tsx";
import type { BoardStore } from "../../board/index.ts";
import { BoardStoreContext } from "./use-board.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";

interface AuthorsProps {
  readonly boardStore: BoardStore;
  readonly keymap: Keymap;
  readonly children: ReactNode;
}

export function Authors(props: AuthorsProps): ReactNode {
  const { boardStore } = props;
  return (
    <BoardStoreContext value={boardStore}>
      <Announcer value={props.keymap.announce}>
        <AuthorCards boardStore={boardStore} keymap={props.keymap}>
          {props.children}
        </AuthorCards>
      </Announcer>
    </BoardStoreContext>
  );
}
