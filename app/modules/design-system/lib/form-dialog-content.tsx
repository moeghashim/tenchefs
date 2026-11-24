import { Content } from "@radix-ui/react-dialog";
import type { FormDialogContentParts } from "./form-dialog-parts.ts";
import { FormDialogText } from "./form-dialog-text.tsx";
import { PromptButtons } from "./prompt-buttons.tsx";
import type { ReactNode } from "react";

export function FormDialogContent(parts: FormDialogContentParts): ReactNode {
  const handleCancel = parts.onCancel;
  return (
    <Content asChild>
      <form
        action={parts.onSubmit}
        className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md -translate-1/2 gap-4 overflow-y-auto rounded-lg border bg-background p-5 shadow-lg"
      >
        <FormDialogText description={parts.description} title={parts.title} />
        <div className="grid gap-3">{parts.children}</div>
        <PromptButtons
          busy={parts.busy}
          busyButton={parts.busyButton}
          button={parts.button}
          disabled={parts.disabled}
          onCancel={handleCancel}
        />
      </form>
    </Content>
  );
}
