import { Portal, Root } from "@radix-ui/react-dialog";
import { FormDialogOverlay } from "./form-dialog-overlay.tsx";
import { ListDialogContent } from "./list-dialog-content.tsx";
import type { ListDialogParts } from "./list-dialog-parts.ts";
import type { ReactNode } from "react";

export function ListDialog(parts: ListDialogParts): ReactNode {
  const handleOpenChange = parts.onClose;
  return (
    <Root onOpenChange={handleOpenChange} open={parts.open}>
      <Portal>
        <FormDialogOverlay />
        <ListDialogContent close={parts.close} description={parts.description} title={parts.title}>
          {parts.children}
        </ListDialogContent>
      </Portal>
    </Root>
  );
}
