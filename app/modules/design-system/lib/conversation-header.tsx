import { BackLink } from "./back-link.tsx";
import type { PanelAction } from "./panel-action-button.tsx";
import { PanelActionButton } from "./panel-action-button.tsx";
import { PanelHeading } from "./panel-heading.tsx";
import type { ReactNode } from "react";
import { ShortcutLink } from "./shortcut-link.tsx";
import type { ShortcutLinkParts } from "./shortcut-link.tsx";

interface ConversationHeaderParts {
  readonly label: string;
  readonly detail: string;
  readonly title: string | null;
  readonly backHref: string;
  readonly backLabel: string;
  readonly open: ShortcutLinkParts | null;
  readonly actions: readonly PanelAction[];
}

export function ConversationHeader(parts: ConversationHeaderParts): ReactNode {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
      <BackLink href={parts.backHref} label={parts.backLabel} />
      <PanelHeading detail={parts.detail} label={parts.label} title={parts.title} />
      {parts.actions.map((action) => (
        <PanelActionButton action={action} key={action.label} />
      ))}
      {parts.open !== null && (
        <ShortcutLink href={parts.open.href} label={parts.open.label} shortcut={parts.open.shortcut} />
      )}
    </header>
  );
}
