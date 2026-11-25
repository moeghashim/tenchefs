import { useMemo, useRef } from "react";

interface ReturnFocus {
  readonly onOpen: () => void;
  readonly onClose: (event: Readonly<Event>) => void;
}

function useReturnFocus(): ReturnFocus {
  const opener = useRef<Element | null>(null);
  return useMemo(
    () => ({
      onClose: (event: Readonly<Event>) => {
        event.preventDefault();
        const element = opener.current;
        const claimed = globalThis.document.activeElement;
        if (claimed !== null && claimed !== globalThis.document.body) {
          return;
        }
        if (element instanceof HTMLElement && element.isConnected) {
          element.focus();
        }
      },
      onOpen: () => {
        opener.current = globalThis.document.activeElement;
      },
    }),
    [],
  );
}

export { useReturnFocus };
