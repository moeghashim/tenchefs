import { ConversationHeader } from "./conversation-header.tsx";
import { FileDrop } from "./file-drop.tsx";
import type { FilesHandler } from "./drop-zone.tsx";
import { IdentityCardComposer } from "./identity-card-parts.ts";
import type { IdentityCardComposerParts } from "./identity-card-parts.ts";
import type { PanelAction } from "./panel-action-button.tsx";
import { PanelEdge } from "./panel-edge.tsx";
import type { PanelEdgeParts } from "./panel-edge-parts.ts";
import type { ReactNode } from "react";
import type { ShortcutLinkParts } from "./shortcut-link.tsx";
import { panelWidth } from "./panel-width.ts";

const NO_ACTIONS: readonly PanelAction[] = [];

interface ConversationPanelParts {
  readonly label: string;
  readonly detail: string;
  readonly title?: string | null;
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
      <ConversationHeader
        actions={parts.actions ?? NO_ACTIONS}
        backHref={parts.backHref}
        backLabel={parts.backLabel}
        detail={parts.detail}
        label={parts.label}
        open={parts.open}
        title={parts.title ?? null}
      />
      <IdentityCardComposer value={parts.message}>
        <FileDrop onFiles={parts.onFiles ?? null}>{parts.children}</FileDrop>
      </IdentityCardComposer>
    </aside>
  );
}
