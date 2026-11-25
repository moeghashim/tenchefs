import { AvatarImages } from "../../design-system/content.tsx";
import type { BoardStore } from "../../board/index.ts";
import { IdentityCards } from "../../design-system/messages.tsx";
import type { ReactNode } from "react";
import { createAvatarImages } from "./avatar-images.ts";
import { createIdentityCards } from "./identity-cards.ts";
import { useMemo } from "react";

interface AuthorFacesProps {
  readonly boardStore: BoardStore;
  readonly children: ReactNode;
}

export function AuthorFaces(props: AuthorFacesProps): ReactNode {
  const { boardStore } = props;
  const images = useMemo(() => createAvatarImages(boardStore), [boardStore]);
  const cards = useMemo(() => createIdentityCards(boardStore), [boardStore]);
  return (
    <AvatarImages value={images}>
      <IdentityCards value={cards}>{props.children}</IdentityCards>
    </AvatarImages>
  );
}
