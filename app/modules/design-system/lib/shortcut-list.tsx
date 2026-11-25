import { Portal, Root } from "@radix-ui/react-dialog";
import { FormDialogOverlay } from "./form-dialog-overlay.tsx";
import type { ReactNode } from "react";
import { ShortcutListContent } from "./shortcut-list-content.tsx";
import type { ShortcutListParts } from "./shortcut-list-parts.ts";
import { useCallback } from "react";

export function ShortcutList(parts: ShortcutListParts): ReactNode {
  const { onClose } = parts;
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose],
  );
  return (
    <Root onOpenChange={handleOpenChange} open={parts.open}>
      <Portal>
        <FormDialogOverlay />
        <ShortcutListContent description={parts.description} groups={parts.groups} title={parts.title} />
      </Portal>
    </Root>
  );
}
