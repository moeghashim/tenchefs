import { useCallback, useContext, useRef } from "react";
import { MessageKeys } from "./message-keys-parts.ts";
import type { ReactNode } from "react";

const UNFOCUSED = -1;

const TEXT = { unfold: "Unfold" } as const;

interface FoldEndParts {
  readonly onUnfold: () => void;
}

function focusedOnArticleOf(element: unknown): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  const article = element.closest("article");
  if (article instanceof HTMLElement) {
    article.focus();
  }
}

export function FoldEnd(parts: FoldEndParts): ReactNode {
  const { unfold } = useContext(MessageKeys);
  const { onUnfold } = parts;
  const end = useRef<HTMLButtonElement>(null);
  const handleUnfold = useCallback(() => {
    focusedOnArticleOf(end.current);
    onUnfold();
  }, [onUnfold]);
  return (
    <button
      aria-keyshortcuts={unfold.keys}
      aria-label={TEXT.unfold}
      className="absolute inset-x-0 bottom-0 h-[3lh] w-full cursor-pointer"
      onClick={handleUnfold}
      ref={end}
      tabIndex={UNFOCUSED}
      title={TEXT.unfold}
      type="button"
    />
  );
}
