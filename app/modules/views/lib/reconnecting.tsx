import type { ReactNode } from "react";
import { StatusBar } from "../../design-system/layout.tsx";
import { useBoardStore } from "./use-board.ts";
import { useSyncExternalStore } from "react";

const TEXT = { label: "Live link", reconnecting: "Reconnecting…" } as const;

export function ReconnectingView(): ReactNode {
  const store = useBoardStore();
  const link = useSyncExternalStore(store.subscribeToLink, store.link);
  return (
    <StatusBar label={TEXT.label} shown={link === "down"}>
      {TEXT.reconnecting}
    </StatusBar>
  );
}
