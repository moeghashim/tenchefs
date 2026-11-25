import type { AvatarImage, AvatarImageSource } from "../../design-system/content.tsx";
import type { BoardStore } from "../../board/index.ts";
import type { Identity } from "../../sdk/index.ts";
import { identityList } from "../../board/index.ts";

function imageFor(identity: Identity): AvatarImage | null {
  const avatar = identity.avatar ?? null;
  if (avatar === null) {
    return null;
  }
  return { alt: identity.displayName ?? identity.name, src: `/v1/avatars/${encodeURIComponent(avatar.id)}` };
}

function imageNamed(boardStore: BoardStore, name: string): AvatarImage | null {
  const identity = identityList(boardStore.snapshot()).find((listed) => listed.name === name) ?? null;
  if (identity === null) {
    return null;
  }
  return imageFor(identity);
}

function sameImage(before: AvatarImage | null, image: AvatarImage): before is AvatarImage {
  return before !== null && before.src === image.src && before.alt === image.alt;
}

export function createAvatarImages(boardStore: BoardStore): AvatarImageSource {
  const drawn = new Map<string, AvatarImage>();
  return {
    imageOf: (name) => {
      const image = imageNamed(boardStore, name);
      if (image === null) {
        drawn.delete(name);
        return null;
      }
      const before = drawn.get(name) ?? null;
      if (sameImage(before, image)) {
        return before;
      }
      drawn.set(name, image);
      return image;
    },
    subscribe: boardStore.subscribeShowing("identities"),
  };
}
