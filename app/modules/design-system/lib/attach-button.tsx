import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useRef } from "react";
import { BOX_BUTTON } from "./box-button-style.ts";
import { PaperclipIcon } from "./paperclip-icon.tsx";
import type { Shortcut } from "./shortcut.ts";

interface AttachButtonParts {
  readonly label: string;
  readonly keys: Shortcut;
  readonly onFiles: (files: readonly File[]) => void;
}

export function AttachButton(parts: AttachButtonParts): ReactNode {
  const { onFiles } = parts;
  const picker = useRef<HTMLInputElement>(null);
  const handleClick = useCallback(() => {
    if (picker.current !== null) {
      picker.current.click();
    }
  }, []);
  const handlePicked = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      onFiles([...(input.files ?? [])]);
      input.value = "";
    },
    [onFiles],
  );
  return (
    <>
      <button
        aria-keyshortcuts={parts.keys.keys}
        aria-label={parts.label}
        className={`${BOX_BUTTON} bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}
        onClick={handleClick}
        title={`${parts.label} (${parts.keys.label})`}
        type="button"
      >
        <PaperclipIcon />
      </button>
      <input
        aria-hidden="true"
        className="hidden"
        multiple
        onChange={handlePicked}
        ref={picker}
        tabIndex={-1}
        type="file"
      />
    </>
  );
}
