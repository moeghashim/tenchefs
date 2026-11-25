import type { ReactNode } from "react";
import type { TextFieldParts } from "./parts.ts";
import { useFocusOnOpen } from "./focus-on-open.ts";

export function TextField(parts: TextFieldParts): ReactNode {
  const box = useFocusOnOpen<HTMLInputElement>(parts.focused === true);
  return (
    <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {parts.label}
      <input
        autoComplete="off"
        className="rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-muted-foreground"
        name={parts.name}
        ref={box}
        required
        spellCheck={false}
        type="password"
      />
    </label>
  );
}
