import { MessageKeys } from "./message-keys-parts.ts";
import type { ReactNode } from "react";
import { useContext } from "react";

const TEXT = { openThread: "Open thread" } as const;

interface OpenThreadKeyParts {
  readonly href: string | null;
}

export function OpenThreadKey(parts: OpenThreadKeyParts): ReactNode {
  const { keys } = useContext(MessageKeys).openThread;
  return parts.href !== null && <a aria-keyshortcuts={keys} aria-label={TEXT.openThread} hidden href={parts.href} />;
}
