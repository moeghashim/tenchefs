import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface FoldedBody {
  readonly body: RefObject<HTMLDivElement | null>;
  readonly folded: boolean;
}

function overflows(element: unknown): boolean {
  return element instanceof HTMLElement && element.scrollHeight > element.clientHeight;
}

export function useFoldedBody(foldable: boolean): FoldedBody {
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    setLong(foldable && overflows(body.current));
  }, [foldable]);
  return { body, folded: foldable && long };
}
