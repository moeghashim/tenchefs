import { hoverThread, useMessageChoices } from "./message-choices.ts";
import { ActionContextMenu } from "./action-context-menu.tsx";
import type { MessageItemParts } from "./message-parts.ts";
import { MessageLayout } from "./message-layout.tsx";
import type { ReactNode } from "react";
import { ThreadTitle } from "./thread-title.tsx";
import { messageClass } from "./message-class.ts";
import { useScrollWhenLinked } from "./use-scroll-when-linked.ts";

const FOCUSABLE = -1;

const TEXT = { menu: "Message actions" } as const;

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
    threadHref: message.threadHref,
  });
  const article = useScrollWhenLinked({ choices, focus: false, linked: message.mark === "linked", menu: message.menu });
  return (
    <ActionContextMenu choices={choices} label={TEXT.menu}>
      <article
        aria-label={`${message.displayName ?? message.name}, ${message.time.full}`}
        aria-current={message.mark === "open" || message.mark === "linked"}
        className={messageClass(message)}
        data-for-you={message.mark === "for-you"}
        ref={article}
        tabIndex={FOCUSABLE}
      >
        {message.title !== null && <ThreadTitle title={message.title} />}
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
          replyOnHover={message.replyOnHover}
          thread={hoverThread(message)}
          time={message.time}
        >
          {message.children}
        </MessageLayout>
      </article>
    </ActionContextMenu>
  );
}
