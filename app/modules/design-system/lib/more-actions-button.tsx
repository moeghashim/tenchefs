import { DotsIcon } from "./dots-icon.tsx";
import type { ReactNode } from "react";
import { Trigger } from "@radix-ui/react-dropdown-menu";

interface MoreActionsButtonParts {
  readonly label: string;
  readonly returning: boolean;
}

export function MoreActionsButton(parts: MoreActionsButtonParts): ReactNode {
  return (
    <Trigger asChild>
      <button
        aria-label={parts.label}
        className="block rounded-md border bg-background px-1.5 py-0.5 text-muted-foreground shadow-sm hover:text-foreground focus-visible:text-foreground data-[returning=true]:visible"
        data-returning={String(parts.returning)}
        title={parts.label}
        type="button"
      >
        <DotsIcon />
      </button>
    </Trigger>
  );
}
