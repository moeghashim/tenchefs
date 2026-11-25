import { MessageKeys, PersonKeysArea } from "../../design-system/messages.tsx";
import { messageShortcutsOf, personKeysOf } from "./person-keys.ts";
import { AuthorFaces } from "./author-faces.tsx";
import type { BoardStore } from "../../board/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { useMemo } from "react";

interface AuthorCardsProps {
  readonly boardStore: BoardStore;
  readonly keymap: Keymap;
  readonly children: ReactNode;
}

export function AuthorCards(props: AuthorCardsProps): ReactNode {
  const { keymap } = props;
  const keys = useMemo(() => personKeysOf(keymap), [keymap]);
  const shortcuts = useMemo(() => messageShortcutsOf(keymap), [keymap]);
  return (
    <AuthorFaces boardStore={props.boardStore}>
      <PersonKeysArea keys={keys}>
        <MessageKeys value={shortcuts}>{props.children}</MessageKeys>
      </PersonKeysArea>
    </AuthorFaces>
  );
}
