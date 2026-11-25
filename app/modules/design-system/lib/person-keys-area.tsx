import { PersonKeys } from "./person-keys-parts.ts";
import type { PersonKeysSource } from "./person-keys-parts.ts";
import type { ReactNode } from "react";

interface PersonKeysAreaParts {
  readonly keys: PersonKeysSource;
  readonly children: ReactNode;
}

export function PersonKeysArea(parts: PersonKeysAreaParts): ReactNode {
  return <PersonKeys value={parts.keys}>{parts.children}</PersonKeys>;
}
