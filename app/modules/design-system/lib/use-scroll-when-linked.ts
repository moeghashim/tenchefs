import type { MessageMenuParts } from "./menu-parts.ts";
import type { RefObject } from "react";
import { useEffect } from "react";
import { useMessageArticle } from "./use-message-article.ts";

const CENTRE: ScrollIntoViewOptions = { block: "center" };

interface ArticleParts {
  readonly menu: MessageMenuParts;
  readonly linked: boolean;
  readonly focus: boolean;
}

export function useScrollWhenLinked({ focus, linked, menu }: ArticleParts): RefObject<HTMLElement | null> {
  const element = useMessageArticle(menu);
  useEffect(() => {
    const shown = element.current;
    if (!linked || shown === null) {
      return;
    }
    shown.scrollIntoView(CENTRE);
    if (focus) {
      shown.focus();
    }
  }, [element, focus, linked]);
  return element;
}
