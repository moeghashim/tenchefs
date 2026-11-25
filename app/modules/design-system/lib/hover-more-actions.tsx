import type { MenuChoice } from "./menu-parts.ts";
import { MoreActions } from "./more-actions.tsx";
import type { ReactNode } from "react";

const BLOCK =
  "invisible absolute top-1/2 right-3 -translate-y-1/2 group-focus-within/actions:visible group-hover/actions:visible has-data-[state=open]:visible";

const INLINE =
  "invisible absolute top-1/2 right-full z-10 mr-1 -translate-y-1/2 group-focus-within/inline-actions:visible group-hover/inline-actions:visible has-data-[state=open]:visible";

interface HoverMoreActionsParts {
  readonly choices: readonly MenuChoice[];
  readonly inline: boolean;
  readonly inTabOrder: boolean;
  readonly label: string;
}

function placeOf(inline: boolean): string {
  if (inline) {
    return INLINE;
  }
  return BLOCK;
}

export function HoverMoreActions(parts: HoverMoreActionsParts): ReactNode {
  return (
    <span className={placeOf(parts.inline)}>
      <MoreActions choices={parts.choices} inTabOrder={parts.inTabOrder} label={parts.label} />
    </span>
  );
}
