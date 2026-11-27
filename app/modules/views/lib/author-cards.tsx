import { AuthorFaces } from "./author-faces.tsx";
import type { BoardStore } from "../../board/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { MessageKeysArea } from "./message-keys-area.tsx";
import { PersonKeysArea } from "../../design-system/messages.tsx";
import type { ReactNode } from "react";
import { personKeysOf } from "./person-keys.ts";
import { useMemo } from "react";

interface AuthorCardsProps {
  readonly boardStore: BoardStore;
  readonly keymap: Keymap;
  readonly children: ReactNode;
}

export function AuthorCards(props: AuthorCardsProps): ReactNode {
  const { keymap } = props;
  const keys = useMemo(() => personKeysOf(keymap), [keymap]);
  return (
    <AuthorFaces boardStore={props.boardStore}>
      <PersonKeysArea keys={keys}>
        <MessageKeysArea keymap={keymap}>{props.children}</MessageKeysArea>
      </PersonKeysArea>
    </AuthorFaces>
  );
}
