import { BackLink } from "./back-link.tsx";
import { FileDrop } from "./file-drop.tsx";
import type { FilesHandler } from "./drop-zone.tsx";
import { IdentityCardComposer } from "./identity-card-parts.ts";
import type { IdentityCardComposerParts } from "./identity-card-parts.ts";
import type { PanelAction } from "./panel-action-button.tsx";
import { PanelActionButton } from "./panel-action-button.tsx";
import { PanelEdge } from "./panel-edge.tsx";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import type { ReactNode } from "react";
import { ShortcutLink } from "./shortcut-link.tsx";
import type { ShortcutLinkParts } from "./shortcut-link.tsx";
import { panelWidth } from "./panel-width.ts";

const NO_ACTIONS: readonly PanelAction[] = [];

interface ConversationPanelParts {
  readonly label: string;
  readonly detail: string;
  readonly backHref: string;
  readonly backLabel: string;
  readonly open: ShortcutLinkParts | null;
  readonly actions?: readonly PanelAction[];
  readonly edge: PanelEdgeParts | null;
  readonly message: IdentityCardComposerParts;
  readonly onFiles?: FilesHandler | null;
  readonly children: ReactNode;
}

export function ConversationPanel(parts: ConversationPanelParts): ReactNode {
  const { edge } = parts;
  const look = panelWidth({ edge, fixed: "md:w-md lg:w-xl" });
  return (
    <aside
      aria-label={parts.label}
      className={`relative flex w-full min-w-0 flex-col bg-card md:shrink-0 md:border-l ${look.width}`}
      style={look.style}
    >
      {edge !== null && <PanelEdge edge={edge} />}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-5">
        <BackLink href={parts.backHref} label={parts.backLabel} />
        <h2 className="text-sm font-semibold">{parts.label}</h2>
        <span className="flex-1 font-mono text-xs text-muted-foreground">{parts.detail}</span>
        {(parts.actions ?? NO_ACTIONS).map((action) => (
          <PanelActionButton action={action} key={action.label} />
        ))}
        {parts.open !== null && (
          <ShortcutLink href={parts.open.href} label={parts.open.label} shortcut={parts.open.shortcut} />
        )}
      </header>
      <IdentityCardComposer value={parts.message}>
        <FileDrop onFiles={parts.onFiles ?? null}>{parts.children}</FileDrop>
      </IdentityCardComposer>
    </aside>
  );
}
