import { useCallback, useRef } from "react";
import { ActionMenu } from "./action-menu.tsx";
import type { ReactNode } from "react";
import { usePersonKeys } from "./use-person-keys.ts";
import { usePersonMenu } from "./use-person-menu.ts";

interface PersonMenuParts {
  readonly name: string;
  readonly profileHref: string;
  readonly inline: boolean;
  readonly moreInTabOrder?: boolean;
  readonly children: ReactNode;
}

export function PersonMenu(parts: PersonMenuParts): ReactNode {
  const menu = usePersonMenu({ name: parts.name, profileHref: parts.profileHref });
  const person = useRef<HTMLSpanElement>(null);
  const within = useCallback(() => person.current, []);
  usePersonKeys({ person: menu, within });
  if (menu === null) {
    return parts.children;
  }
  return (
    <span className="contents" ref={person}>
      <ActionMenu
        buttonLabel={menu.buttonLabel}
        choices={menu.choices}
        inline={parts.inline}
        label={menu.label}
        moreInTabOrder={parts.moreInTabOrder ?? true}
      >
        {parts.children}
      </ActionMenu>
    </span>
  );
}
