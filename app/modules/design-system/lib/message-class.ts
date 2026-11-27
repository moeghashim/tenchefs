import type { MessageItemParts } from "./message-parts.ts";

const MARKS: Readonly<Record<MessageItemParts["mark"], string>> = {
  "for-you": "bg-mention-bg shadow-[inset_2px_0_0_var(--color-mention-bar)]",
  linked: "bg-accent motion-safe:animate-linked-fade",
  none: "hover:bg-hover focus-within:bg-hover",
  open: "bg-accent",
};

const TITLED_BAR = "shadow-[inset_3px_0_0_var(--color-muted-foreground)]";

const TITLED_MARKS: Readonly<Record<MessageItemParts["mark"], string>> = {
  "for-you": `flex-wrap ${MARKS["for-you"]}`,
  linked: `flex-wrap ${TITLED_BAR} ${MARKS.linked}`,
  none: `flex-wrap ${TITLED_BAR} bg-[color-mix(in_oklab,var(--color-foreground)_2.5%,transparent)] hover:bg-hover focus-within:bg-hover`,
  open: `flex-wrap ${TITLED_BAR} ${MARKS.open}`,
};

function markOf(parts: Pick<MessageItemParts, "mark" | "title">): string {
  if (parts.title === null) {
    return MARKS[parts.mark];
  }
  return TITLED_MARKS[parts.mark];
}

function spacingOf(parts: Pick<MessageItemParts, "grouped" | "spaced">): string {
  if (parts.grouped) {
    return "py-0.5";
  }
  if (parts.spaced) {
    return "pt-4 pb-2.5";
  }
  return "pt-2.5 pb-1";
}

function messageClass(parts: Pick<MessageItemParts, "grouped" | "mark" | "spaced" | "title">): string {
  return `group relative flex gap-x-3 px-5 outline-none focus-visible:ring-2 focus-visible:ring-link/50 focus-visible:ring-inset ${spacingOf(parts)} ${markOf(parts)}`;
}

export { messageClass };
