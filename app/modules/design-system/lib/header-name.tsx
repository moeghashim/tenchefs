import { IdentityCard } from "./identity-card.tsx";
import { PersonMenu } from "./person-menu.tsx";
import type { ReactNode } from "react";

interface HeaderNameParts {
  readonly name: string;
  readonly nameHref: string;
  readonly displayName: string | null;
}

export function HeaderName(parts: HeaderNameParts): ReactNode {
  return (
    <PersonMenu inline name={parts.name} profileHref={parts.nameHref}>
      <IdentityCard name={parts.name}>
        <a className="text-sm font-semibold hover:underline" href={parts.nameHref}>
          {parts.displayName ?? parts.name}
        </a>
      </IdentityCard>
    </PersonMenu>
  );
}
