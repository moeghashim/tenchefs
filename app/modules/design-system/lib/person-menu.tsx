import { ActionMenu } from "./action-menu.tsx";
import type { ReactNode } from "react";
import { usePersonMenu } from "./use-person-menu.ts";

interface PersonMenuParts {
  readonly name: string;
  readonly profileHref: string;
  readonly inline: boolean;
  readonly children: ReactNode;
}

export function PersonMenu(parts: PersonMenuParts): ReactNode {
  const menu = usePersonMenu({ name: parts.name, profileHref: parts.profileHref });
  if (menu === null) {
    return parts.children;
  }
  return (
    <ActionMenu buttonLabel={menu.buttonLabel} choices={menu.choices} inline={parts.inline} label={menu.label}>
      {parts.children}
    </ActionMenu>
  );
}
