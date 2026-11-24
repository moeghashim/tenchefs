import { AuthorList } from "./author-list.ts";
import type { BoardStore } from "../../board/index.ts";
import { IdentityCards } from "../../design-system/index.tsx";
import { PresenceList } from "./presence-list.ts";
import type { ReactNode } from "react";
import { createIdentityCards } from "./identity-cards.ts";
import { useMemo } from "react";

interface AuthorsProps {
  readonly boardStore: BoardStore;
  readonly children: ReactNode;
}

export function Authors(props: AuthorsProps): ReactNode {
  const { boardStore } = props;
  const cards = useMemo(() => createIdentityCards(boardStore), [boardStore]);
  return (
    <AuthorList value={boardStore}>
      <PresenceList value={boardStore}>
        <IdentityCards value={cards}>{props.children}</IdentityCards>
      </PresenceList>
    </AuthorList>
  );
}
