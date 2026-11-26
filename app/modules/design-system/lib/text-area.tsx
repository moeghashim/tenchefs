import type { ClipboardEvent, ReactNode } from "react";
import { useCallback, useId } from "react";
import type { TextAreaParts } from "./parts.ts";
import { comboboxOf } from "./combobox.ts";
import { useBoxKeys } from "./box-keys.ts";
import { useTypedCaret } from "./use-typed-caret.ts";

const ROWS = 3;
const NONE = 0;

function pastedFiles(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const clipboard = event.clipboardData;
  const files = [...clipboard.files];
  if (files.length > NONE) {
    return files;
  }
  const fromItems: File[] = [];
  for (const item of clipboard.items) {
    const file = item.kind === "file" && item.getAsFile();
    if (file instanceof File) {
      fromItems.push(file);
    }
  }
  return fromItems;
}

export function TextArea(parts: TextAreaParts): ReactNode {
  const { caret, choosing, focused, onClose, onEdit, onMove, onPick, value } = parts;
  const { focusRequests, onPasteFiles } = parts;
  const id = useId();
  const { box, handleEdit } = useTypedCaret({ caret, focusRequests, focused, onEdit, value });
  const handleSend = useCallback(() => {
    const element = box.current;
    if (element !== null && element.form !== null) {
      element.form.requestSubmit();
    }
  }, [box]);
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = pastedFiles(event);
      if (files.length > NONE) {
        event.preventDefault();
        onPasteFiles(files);
      }
    },
    [onPasteFiles],
  );
  const handleKeyDown = useBoxKeys({ choosing, onClose, onMove, onPick, onSend: handleSend });
  const combobox = comboboxOf({ choosing, highlighted: parts.highlighted, list: parts.list });
  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <label htmlFor={id}>{parts.label}</label>
      <textarea
        aria-activedescendant={combobox.activeOption}
        aria-autocomplete={combobox.autocomplete}
        aria-controls={combobox.list}
        aria-expanded={combobox.expanded}
        className="rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-muted-foreground"
        id={id}
        name={parts.name}
        onChange={handleEdit}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={handleEdit}
        ref={box}
        required={parts.required}
        role={combobox.role}
        rows={ROWS}
        value={value}
      />
    </div>
  );
}
