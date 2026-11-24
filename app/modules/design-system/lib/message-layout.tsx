import { Avatar } from "./avatar.tsx";
import { HoverButtons } from "./hover-buttons.tsx";
import { MessageHeader } from "./message-header.tsx";
import type { MessageLayoutParts } from "./parts.ts";
import { MessageTime } from "./message-time.tsx";
import type { ReactNode } from "react";

export function MessageLayout(parts: MessageLayoutParts): ReactNode {
  const { time } = parts;
  const handleAction = parts.onAction;
  return (
    <>
      <div className="flex w-9 shrink-0 justify-center">
        {parts.grouped && (
          <MessageTime full={time.full} hidden iso={time.iso} receipt={time.receipt} shown={time.short} />
        )}
        {!parts.grouped && <Avatar agent={parts.agent} name={parts.name} presence={parts.presence} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {!parts.grouped && (
          <MessageHeader
            agent={parts.agent}
            displayName={parts.displayName}
            name={parts.name}
            nameHref={parts.nameHref}
            note={parts.note}
            time={time}
          />
        )}
        {parts.children}
      </div>
      <HoverButtons
        actionHref={parts.actionHref}
        actionLabel={parts.actionLabel}
        choices={parts.choices}
        onAction={handleAction}
        reactions={parts.reactions}
        replyOnHover={parts.replyOnHover}
        thread={parts.thread}
      />
    </>
  );
}
