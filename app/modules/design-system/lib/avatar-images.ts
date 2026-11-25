import type { AvatarImageSource } from "./avatar-parts.ts";
import { createContext } from "react";

function nothing(): null {
  return null;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const AvatarImages = createContext<AvatarImageSource>({ imageOf: nothing, subscribe });

export { AvatarImages };
