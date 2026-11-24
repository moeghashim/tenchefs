import { HeaderName } from "./header-name.tsx";
import type { MessageHeaderParts } from "./parts.ts";
import { MessageTime } from "./message-time.tsx";
import type { ReactNode } from "react";

const AGENT = "agent";

export function MessageHeader(parts: MessageHeaderParts): ReactNode {
  const { time } = parts;
  return (
    <header className="flex items-baseline gap-2">
      <HeaderName displayName={parts.displayName} name={parts.name} nameHref={parts.nameHref} />
      {parts.displayName !== null && <span className="text-xs text-muted-foreground">{`@${parts.name}`}</span>}
      {parts.note !== null && <span className="text-xs text-muted-foreground">{parts.note}</span>}
      {parts.agent && (
        <span className="self-center rounded border px-1 py-px text-[10px] leading-none font-medium tracking-wide text-muted-foreground uppercase">
          {AGENT}
        </span>
      )}
      <MessageTime full={time.full} hidden={false} iso={time.iso} receipt={time.receipt} shown={time.ago} />
    </header>
  );
}
