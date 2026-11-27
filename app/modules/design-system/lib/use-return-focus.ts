import { useMemo, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]';

interface ReturnFocus {
  readonly onOpen: () => void;
  readonly onClose: (event: Readonly<Event>) => void;
}

interface Returning {
  readonly around: readonly unknown[];
  readonly opener: unknown;
  readonly returnTo: string | null;
}

function ancestorsOf(element: unknown): readonly unknown[] {
  if (!(element instanceof Element) || element.parentElement === null) {
    return [];
  }
  return [element.parentElement, ...ancestorsOf(element.parentElement)];
}

function nearestLeft(around: readonly unknown[]): Element | null {
  const left = around.find((ancestor) => ancestor instanceof Element && ancestor.isConnected);
  if (left instanceof Element) {
    return left.querySelector(FOCUSABLE);
  }
  return null;
}

function returnedTo({ around, opener, returnTo }: Returning): Element | null {
  if (opener instanceof HTMLElement && opener.isConnected) {
    return opener;
  }
  if (returnTo === null) {
    return nearestLeft(around);
  }
  return globalThis.document.querySelector(returnTo);
}

function focusReturned(returning: Returning): void {
  const element = returnedTo(returning);
  const claimed = globalThis.document.activeElement;
  if (claimed !== null && claimed !== globalThis.document.body) {
    return;
  }
  if (element instanceof HTMLElement) {
    element.focus();
  }
}

interface Returns {
  readonly returnTo: string | null;
  readonly onFocused?: (() => void) | undefined;
}

function useReturnFocus({ onFocused, returnTo }: Returns): ReturnFocus {
  const opener = useRef<unknown>(null);
  const around = useRef<readonly unknown[]>([]);
  return useMemo(
    () => ({
      onClose: (event: Readonly<Event>) => {
        event.preventDefault();
        focusReturned({ around: around.current, opener: opener.current, returnTo });
        if (typeof onFocused === "function") {
          onFocused();
        }
      },
      onOpen: () => {
        opener.current = globalThis.document.activeElement;
        around.current = ancestorsOf(opener.current);
      },
    }),
    [onFocused, returnTo],
  );
}

export { useReturnFocus };
