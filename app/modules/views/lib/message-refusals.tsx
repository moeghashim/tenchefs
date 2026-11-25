import { ClosingRefusal } from "./closing-refusal.tsx";
import { MarkUnreadRefusal } from "./mark-unread-refusal.tsx";
import type { MenuClosing } from "./use-message-menu.ts";
import type { MessageMenu } from "../../unread/index.ts";
import type { ReactNode } from "react";
import { ReactionRefusal } from "./reaction-refusal.tsx";

interface MessageRefusalsProps {
  readonly menu: MessageMenu;
  readonly closing: MenuClosing;
}

export function MessageRefusals(props: MessageRefusalsProps): ReactNode {
  return (
    <>
      <MarkUnreadRefusal menu={props.menu} />
      <ReactionRefusal />
      {props.closing !== null && <ClosingRefusal />}
    </>
  );
}
