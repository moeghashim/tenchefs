import type { MenuChoice, MessageMenuParts } from "./menu-parts.ts";
import { useContext, useEffect } from "react";
import { MessageActions } from "./message-actions.ts";
import type { RefObject } from "react";
import { useMessageArticle } from "./use-message-article.ts";

const CENTRE: ScrollIntoViewOptions = { block: "center" };

interface ArticleParts {
  readonly menu: MessageMenuParts;
  readonly linked: boolean;
  readonly focus: boolean;
  readonly choices: readonly MenuChoice[];
}

export function useScrollWhenLinked({ choices, focus, linked, menu }: ArticleParts): RefObject<HTMLElement | null> {
  const element = useMessageArticle(menu);
  const { offer, withdraw } = useContext(MessageActions);
  useEffect(() => {
    const shown = element.current;
    offer(shown, choices);
    return (): void => {
      withdraw(shown);
    };
  }, [choices, element, offer, withdraw]);
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
