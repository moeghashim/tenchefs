import type { ChipParts } from "./parts.ts";
import type { ReactNode } from "react";

function chipStyle(pressed: boolean): string {
  if (pressed) {
    return "border-foreground bg-foreground text-background";
  }
  return "text-muted-foreground hover:text-foreground";
}

export function Chip(parts: ChipParts): ReactNode {
  const { onClick } = parts;
  return (
    <button
      aria-pressed={parts.pressed}
      className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors ${chipStyle(parts.pressed)}`}
      onClick={onClick}
      type="button"
    >
      {parts.children}
    </button>
  );
}
