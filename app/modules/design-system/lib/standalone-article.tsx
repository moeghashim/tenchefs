import { hoverThread, useMessageChoices } from "./message-choices.ts";
import { ActionContextMenu } from "./action-context-menu.tsx";
import { MessageLayout } from "./message-layout.tsx";
import type { ReactNode } from "react";
import type { StandaloneMessageParts } from "./parts.ts";
import { messageClass } from "./message-class.ts";
import { useScrollWhenLinked } from "./use-scroll-when-linked.ts";

const TEXT = { menu: "Message actions" } as const;

interface StandaloneArticleParts {
  readonly message: StandaloneMessageParts;
}

export function StandaloneArticle(parts: StandaloneArticleParts): ReactNode {
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
    <ActionContextMenu choices={choices} label={TEXT.menu}>
      <article
        aria-current={message.mark === "linked"}
        aria-label={message.label}
        className={messageClass(message)}
        data-for-you={message.mark === "for-you"}
        ref={article}
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
