import { ConfirmButtons } from "./confirm-buttons.tsx";
import type { ConfirmContentParts } from "./confirm-parts.ts";
import { ConfirmText } from "./confirm-text.tsx";
import { Content } from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";
import { useReturnFocus } from "./use-return-focus.ts";

export function ConfirmContent(parts: ConfirmContentParts): ReactNode {
  const focus = useReturnFocus({ onFocused: parts.onCloseFocused, returnTo: parts.returnTo });
  const handleOpenAutoFocus = focus.onOpen;
  const handleCloseAutoFocus = focus.onClose;
  const handleConfirm = parts.onConfirm;
  return (
    <Content asChild onCloseAutoFocus={handleCloseAutoFocus} onOpenAutoFocus={handleOpenAutoFocus}>
      <div className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-1/2 gap-3 rounded-lg border bg-background p-5 shadow-lg">
        <ConfirmText body={parts.body} title={parts.title} />
        {parts.error !== null && (
          <p className="text-xs text-destructive" role="alert">
            {parts.error}
          </p>
        )}
        <ConfirmButtons
          confirm={parts.confirm}
          destructive={parts.destructive}
          onConfirm={handleConfirm}
          pending={parts.pending}
        />
      </div>
    </Content>
  );
}
