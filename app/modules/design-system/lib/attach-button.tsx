import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useRef } from "react";
import { PaperclipIcon } from "./paperclip-icon.tsx";

interface AttachButtonParts {
  readonly label: string;
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
        aria-label={parts.label}
        className="self-start rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={handleClick}
        title={parts.label}
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
