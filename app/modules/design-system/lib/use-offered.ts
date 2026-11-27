import { useContext, useEffect, useRef } from "react";
import type { MenuChoice } from "./menu-parts.ts";
import { MessageActions } from "./message-actions.ts";
import type { RefObject } from "react";

interface Offering {
  readonly choices: readonly MenuChoice[];
}

function useOffered<Shown extends HTMLElement>({ choices }: Offering): RefObject<Shown | null> {
  const element = useRef<Shown>(null);
  const { offer, withdraw } = useContext(MessageActions);
  useEffect(() => {
    const target = element.current;
    offer(target, choices);
    return (): void => {
      withdraw(target);
    };
  }, [choices, offer, withdraw]);
  return element;
}

export { useOffered };
