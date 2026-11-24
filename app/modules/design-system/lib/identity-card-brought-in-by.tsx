import type { IdentityCardLink } from "./identity-card-parts.ts";
import { QuietLink } from "./quiet-link.tsx";
import type { ReactNode } from "react";

const BROUGHT_IN_BY = "Brought in by ";

interface IdentityCardBroughtInByParts {
  readonly bringer: IdentityCardLink;
}

export function IdentityCardBroughtInBy({ bringer }: IdentityCardBroughtInByParts): ReactNode {
  return (
    <p className="text-[13px] leading-5 text-muted-foreground">
      {BROUGHT_IN_BY}
      <QuietLink href={bringer.href}>{`@${bringer.name}`}</QuietLink>
    </p>
  );
}
