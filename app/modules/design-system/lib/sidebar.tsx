import type { CSSProperties, ReactNode } from "react";
import { CollapseButton } from "./collapse-button.tsx";
import { PanelEdge } from "./panel-edge.tsx";
import type { SidebarParts } from "./parts.ts";

const NO_STYLE: CSSProperties = {};

function openStyle(open: boolean): string {
  if (open) {
    return "fixed top-12 bottom-0 left-0 z-30 flex shadow-xl md:relative md:shadow-none";
  }
  return "relative hidden md:flex";
}

function widthStyle(rail: boolean): string {
  if (rail) {
    return "w-12";
  }
  return "w-64 md:w-(--sidebar-width)";
}

function widthOf(rail: boolean, width: number): CSSProperties {
  if (rail) {
    return NO_STYLE;
  }
  const style: Readonly<Record<string, string>> = { "--sidebar-width": `${String(width)}px` };
  return style;
}

function headerStyle(rail: boolean): string {
  if (rail) {
    return "justify-center";
  }
  return "justify-between px-4";
}

export function Sidebar(parts: SidebarParts): ReactNode {
  const handleToggle = parts.onToggleCollapsed;
  const handleFollowHome = parts.onFollowHome;
  const rail = parts.collapsed && !parts.open;
  return (
    <nav
      aria-label={parts.label}
      className={`${widthStyle(rail)} shrink-0 flex-col border-r bg-card ${openStyle(parts.open)}`}
      style={widthOf(rail, parts.edge.width)}
    >
      {!rail && <PanelEdge edge={parts.edge} />}
      <div className={`flex h-14 shrink-0 items-center ${headerStyle(rail)}`}>
        {!rail && (
          <a
            className="rounded font-mono text-sm font-semibold tracking-tight hover:text-muted-foreground"
            href={parts.home}
            onClick={handleFollowHome}
          >
            {parts.title}
          </a>
        )}
        <CollapseButton collapsed={rail} onClick={handleToggle} />
      </div>
      {!rail && parts.children}
    </nav>
  );
}
