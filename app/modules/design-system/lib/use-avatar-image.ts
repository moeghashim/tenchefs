import { useCallback, useContext, useState, useSyncExternalStore } from "react";
import type { AvatarImage } from "./avatar-parts.ts";
import { AvatarImages } from "./avatar-images.ts";

interface ShownImage {
  readonly image: AvatarImage | null;
  readonly onError: () => void;
}

function useAvatarImage(name: string): ShownImage {
  const source = useContext(AvatarImages);
  const image = useSyncExternalStore(source.subscribe, () => source.imageOf(name));
  const [failed, setFailed] = useState<string | null>(null);
  const onError = useCallback(() => {
    if (image !== null) {
      setFailed(image.src);
    }
  }, [image]);
  if (image === null || image.src === failed) {
    return { image: null, onError };
  }
  return { image, onError };
}

export { useAvatarImage };
