import type { MessageMenuParts } from "./menu-parts.ts";
import type { RefObject } from "react";
import { useEffect } from "react";
import { useMessageArticle } from "./use-message-article.ts";

const CENTRE: ScrollIntoViewOptions = { block: "center" };

interface ArticleParts {
  readonly menu: MessageMenuParts;
  readonly linked: boolean;
}

export function useScrollWhenLinked({ linked, menu }: ArticleParts): RefObject<HTMLElement | null> {
  const element = useMessageArticle(menu);
  useEffect(() => {
    const shown = element.current;
    if (linked && shown !== null) {
      shown.scrollIntoView(CENTRE);
    }
  }, [element, linked]);
  return element;
}
