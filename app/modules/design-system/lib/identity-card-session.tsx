import { useCallback, useContext, useSyncExternalStore } from "react";
import type { IdentityCardShownParts } from "./identity-card-parts.ts";
import { IdentityCards } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

const OPEN_SESSION = "Open session ↗";

export function IdentityCardSessionLink(parts: IdentityCardShownParts): ReactNode {
  const { name } = parts.card;
  const source = useContext(IdentityCards);
  const subscribeToSession = useCallback(
    (listener: () => void) => source.subscribeSession(listener, name),
    [source, name],
  );
  const session = useSyncExternalStore(subscribeToSession, () => source.sessionOf(name));
  if (session === null) {
    return null;
  }
  return (
    <a
      className="flex items-baseline justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[13px] leading-5 font-medium hover:bg-muted"
      href={session.href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {OPEN_SESSION}
      <span className="truncate font-normal text-muted-foreground">{session.host}</span>
    </a>
  );
}
