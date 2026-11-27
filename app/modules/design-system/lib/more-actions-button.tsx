import { DotsIcon } from "./dots-icon.tsx";
import type { ReactNode } from "react";
import { Trigger } from "@radix-ui/react-dropdown-menu";

interface MoreActionsButtonParts {
  readonly label: string;
  readonly returning: boolean;
  readonly inTabOrder: boolean;
}

const TAB_STOP = 0;
const OUT_OF_TAB_ORDER = -1;
const SHARED =
  "block bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:text-foreground data-[returning=true]:visible";

function tabIndexOf(inTabOrder: boolean): number {
  if (inTabOrder) {
    return TAB_STOP;
  }
  return OUT_OF_TAB_ORDER;
}

export function MoreActionsButton(parts: MoreActionsButtonParts): ReactNode {
  return (
    <Trigger asChild>
      <button
        aria-label={parts.label}
        className={`rounded-md border px-1.5 py-0.5 ${SHARED}`}
        data-returning={String(parts.returning)}
        tabIndex={tabIndexOf(parts.inTabOrder)}
        title={parts.label}
        type="button"
      >
        <DotsIcon />
      </button>
    </Trigger>
  );
}
