import { IdentityCardBox } from "./identity-card-box.tsx";
import type { IdentityCardBoxParts } from "./identity-card-parts.ts";
import { Portal } from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export function IdentityCardPortal(parts: IdentityCardBoxParts): ReactNode {
  return (
    <Portal>
      <IdentityCardBox card={parts.card} />
    </Portal>
  );
}
