import type { NavLinkParts } from "./parts.ts";
import type { ReactNode } from "react";

const ICONS = {
  channel: null,
  inbox: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <path d="M2 9h3l1 2h4l1-2h3M3.5 3h9L14 9v4H2V9z" strokeLinejoin="round" />
    </svg>
  ),
  people: (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <circle cx="6" cy="5.5" r="2.5" />
      <path
        d="M1.5 13.5c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4M11 3.2a2.4 2.4 0 010 4.6M12.5 9.8c1 .6 1.8 1.9 2 3.7"
        strokeLinecap="round"
      />
    </svg>
  ),
} as const;

function linkStyle(parts: NavLinkParts): string {
  if (parts.active) {
    return "bg-accent text-foreground";
  }
  if (parts.marked) {
    return "text-foreground hover:bg-hover";
  }
  return "text-muted-foreground hover:bg-hover hover:text-foreground";
}

const FONTS = { channel: "font-mono", inbox: "", people: "" } as const;

function textStyle(parts: NavLinkParts): string {
  const font = FONTS[parts.icon];
  if (parts.marked) {
    return `${font} font-semibold`;
  }
  return font;
}

function currentOf(active: boolean): "page" | false {
  if (active) {
    return "page";
  }
  return false;
}

interface NavAnchorParts {
  readonly link: NavLinkParts;
}

export function NavAnchor(parts: NavAnchorParts): ReactNode {
  const { link } = parts;
  return (
    <a
      aria-current={currentOf(link.active)}
      className={`mx-2 flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] ${linkStyle(link)}`}
      href={link.href}
    >
      <span aria-hidden="true" className="flex w-4 justify-center text-muted-foreground">
        {ICONS[link.icon]}
      </span>
      <span className={`flex-1 truncate ${textStyle(link)}`}>{link.label}</span>
      {link.children}
    </a>
  );
}
