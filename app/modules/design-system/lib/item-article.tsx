import { hoverThread, useMessageChoices } from "./message-choices.ts";
import { MessageContextMenu } from "./message-context-menu.tsx";
import type { MessageItemParts } from "./parts.ts";
import { MessageLayout } from "./message-layout.tsx";
import type { ReactNode } from "react";
import { messageClass } from "./message-class.ts";
import { useScrollWhenLinked } from "./use-scroll-when-linked.ts";

const FOCUSABLE = 0;

interface ItemArticleParts {
  readonly message: MessageItemParts;
}

export function ItemArticle(parts: ItemArticleParts): ReactNode {
  const { message } = parts;
  const handleAction = message.onAction;
  const choices = useMessageChoices({
    actionHref: message.actionHref,
    actionLabel: message.actionLabel,
    menu: message.menu,
    onAction: handleAction,
  });
  const article = useScrollWhenLinked({ linked: message.mark === "linked", menu: message.menu });
  return (
    <MessageContextMenu choices={choices}>
      <article
        aria-current={message.mark === "open" || message.mark === "linked"}
        className={messageClass(message)}
        data-for-you={message.mark === "for-you"}
        ref={article}
        tabIndex={FOCUSABLE}
      >
        <MessageLayout
          actionHref={message.actionHref}
          actionLabel={message.actionLabel}
          agent={message.agent}
          displayName={message.displayName}
          grouped={message.grouped}
          choices={choices}
          name={message.name}
          nameHref={message.nameHref}
          note={message.note}
          onAction={handleAction}
          presence={message.presence}
          reactions={message.menu.reactions}
          thread={hoverThread(message)}
          time={message.time}
        >
          {message.children}
        </MessageLayout>
      </article>
    </MessageContextMenu>
  );
}
