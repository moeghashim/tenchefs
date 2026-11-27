import { Content } from "@radix-ui/react-dialog";
import { FormDialogText } from "./form-dialog-text.tsx";
import { ListDialogClose } from "./list-dialog-close.tsx";
import type { ListDialogContentParts } from "./list-dialog-parts.ts";
import type { ReactNode } from "react";
import { useReturnFocus } from "./use-return-focus.ts";

export function ListDialogContent(parts: ListDialogContentParts): ReactNode {
  const focus = useReturnFocus({ returnTo: null });
  const handleOpenAutoFocus = focus.onOpen;
  const handleCloseAutoFocus = focus.onClose;
  return (
    <Content asChild onCloseAutoFocus={handleCloseAutoFocus} onOpenAutoFocus={handleOpenAutoFocus}>
      <div className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-1/2 gap-4 overflow-y-auto rounded-lg border bg-background p-5 shadow-lg">
        <FormDialogText description={parts.description} title={parts.title} />
        <div className="grid gap-3">{parts.children}</div>
        <ListDialogClose label={parts.close} />
      </div>
    </Content>
  );
}
