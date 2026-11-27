import type { ChangeEvent, ReactNode } from "react";
import { useCallback, useRef } from "react";

interface AvatarFieldParts {
  readonly accept: readonly string[];
  readonly label: string;
  readonly pick: string;
  readonly onFile: (file: File) => void;
  readonly children?: ReactNode;
}

export function AvatarField(parts: AvatarFieldParts): ReactNode {
  const { onFile } = parts;
  const picker = useRef<HTMLInputElement>(null);
  const handleClick = useCallback(() => {
    if (picker.current !== null) {
      picker.current.click();
    }
  }, []);
  const handlePicked = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      for (const file of input.files ?? []) {
        onFile(file);
      }
      input.value = "";
    },
    [onFile],
  );
  return (
    <fieldset aria-label={parts.label} className="flex flex-col items-start gap-2">
      <button
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        data-avatar-picker=""
        onClick={handleClick}
        type="button"
      >
        {parts.pick}
      </button>
      <input
        accept={parts.accept.join(",")}
        aria-hidden="true"
        className="hidden"
        onChange={handlePicked}
        ref={picker}
        tabIndex={-1}
        type="file"
      />
      {parts.children}
    </fieldset>
  );
}
