import type { PresenceShown } from "./avatar-parts.ts";
import type { ReactNode } from "react";
import { createContext } from "react";

interface IdentityCardParts {
  readonly name: string;
  readonly agent: boolean;
  readonly displayName: string | null;
  readonly presence: PresenceShown | null;
  readonly kind: string;
  readonly description: string | null;
  readonly deactivated: boolean;
  readonly profileHref: string;
}

interface IdentityCardSource {
  readonly subscribe: (listener: () => void) => () => void;
  readonly cardOf: (name: string) => IdentityCardParts | null;
}

interface IdentityCardTriggerParts {
  readonly name: string;
  readonly children: ReactNode;
}

interface IdentityCardBoxParts {
  readonly card: IdentityCardParts;
}

function noCard(): IdentityCardParts | null {
  return null;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const IdentityCards = createContext<IdentityCardSource>({ cardOf: noCard, subscribe });

export { IdentityCards };
export type { IdentityCardBoxParts, IdentityCardParts, IdentityCardSource, IdentityCardTriggerParts };
