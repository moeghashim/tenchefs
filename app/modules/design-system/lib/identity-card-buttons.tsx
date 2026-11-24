import type { IdentityCardBoxParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";

const TEXT = { message: "Message", viewProfile: "View profile" } as const;
const BUTTON = "inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium transition";

export function IdentityCardButtons(parts: IdentityCardBoxParts): ReactNode {
  const { card, control } = parts;
  const handleMessage = control.onMessage;
  const handleProfile = control.onClose;
  const handleKeyDown = control.onStopKeyDown;
  return (
    <div className="grid grid-cols-2 gap-2 pt-0.5">
      <button
        className={`${BUTTON} border bg-surface text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50`}
        disabled={!control.canMessage}
        onClick={handleMessage}
        onKeyDown={handleKeyDown}
        type="button"
      >
        {TEXT.message}
      </button>
      <a
        className={`${BUTTON} bg-foreground text-background hover:opacity-90`}
        href={card.profileHref}
        onClick={handleProfile}
        onKeyDown={handleKeyDown}
      >
        {TEXT.viewProfile}
      </a>
    </div>
  );
}
