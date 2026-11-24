import { HoverButton } from "./hover-button.tsx";
import type { ReactNode } from "react";
import type { ThreadChoice } from "./menu-parts.ts";
import { menuIcon } from "./menu-icons.ts";

interface HoverThreadParts {
  readonly thread: ThreadChoice;
}

export function HoverThread(parts: HoverThreadParts): ReactNode {
  const { thread } = parts;
  const handleThread = thread.onSelect;
  return (
    <HoverButton name={thread.name} onClick={handleThread}>
      {menuIcon(thread.icon)}
    </HoverButton>
  );
}
