import { useCallback, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFocusOnOpen } from "./focus-on-open.ts";

interface Typed {
  readonly focused: boolean;
  readonly caret: number;
  readonly value: string;
  readonly focusRequests: number;
  readonly onEdit: (text: string, caret: number) => void;
}

interface Caret {
  readonly box: RefObject<HTMLTextAreaElement | null>;
  readonly handleEdit: () => void;
}

export function useTypedCaret(typed: Typed): Caret {
  const { caret, focusRequests, onEdit, value } = typed;
  const box = useFocusOnOpen<HTMLTextAreaElement>(typed.focused);
  const seen = useRef({ caret, focusRequests, value });
  const handleEdit = useCallback(() => {
    const element = box.current;
    if (element !== null) {
      seen.current = { caret: element.selectionStart, focusRequests: seen.current.focusRequests, value: element.value };
      onEdit(element.value, element.selectionStart);
    }
  }, [box, onEdit]);
  useLayoutEffect(() => {
    const element = box.current;
    if (element !== null) {
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, [box]);
  useLayoutEffect(() => {
    const element = box.current;
    const { current } = seen;
    if (
      element === null ||
      (current.value === value && current.caret === caret && current.focusRequests === focusRequests)
    ) {
      return;
    }
    seen.current = { caret, focusRequests, value };
    element.focus();
    element.setSelectionRange(caret, caret);
  }, [box, caret, focusRequests, value]);
  return { box, handleEdit };
}
