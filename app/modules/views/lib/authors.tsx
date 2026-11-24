import { AuthorList } from "./author-list.ts";
import type { BoardStore } from "../../board/index.ts";
import type { Identities } from "../../composer/index.ts";
import { IdentityCards } from "../../design-system/index.tsx";
import { PresenceList } from "./presence-list.ts";
import type { ReactNode } from "react";
import { createIdentityCards } from "./identity-cards.ts";
import { useMemo } from "react";

interface AuthorsProps {
  readonly identities: Identities;
  readonly boardStore: BoardStore;
  readonly children: ReactNode;
}

export function Authors(props: AuthorsProps): ReactNode {
  const { boardStore, identities } = props;
  const cards = useMemo(() => createIdentityCards({ boardStore, identities }), [boardStore, identities]);
  return (
    <AuthorList value={identities}>
      <PresenceList value={boardStore}>
        <IdentityCards value={cards}>{props.children}</IdentityCards>
      </PresenceList>
    </AuthorList>
  );
}
