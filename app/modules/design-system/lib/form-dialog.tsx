import { Portal, Root } from "@radix-ui/react-dialog";
import { FormDialogContent } from "./form-dialog-content.tsx";
import { FormDialogOverlay } from "./form-dialog-overlay.tsx";
import type { FormDialogParts } from "./form-dialog-parts.ts";
import type { ReactNode } from "react";
import { useCallback } from "react";

export function FormDialog(parts: FormDialogParts): ReactNode {
  const { onCancel } = parts;
  const handleCancel = onCancel;
  const handleSubmit = parts.onSubmit;
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onCancel();
      }
    },
    [onCancel],
  );
  return (
    <Root onOpenChange={handleOpenChange} open={parts.open}>
      <Portal>
        <FormDialogOverlay />
        <FormDialogContent
          busy={parts.busy}
          busyButton={parts.busyButton}
          button={parts.button}
          description={parts.description}
          disabled={parts.disabled}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          title={parts.title}
        >
          {parts.children}
        </FormDialogContent>
      </Portal>
    </Root>
  );
}
