import type { Keymap } from "../../keymap/index.ts";
import type { Layout } from "../../layout/index.ts";
import type { ReactNode } from "react";
import type { ScheduleList } from "../../board/index.ts";
import type { Unread } from "../../unread/index.ts";
import { useDrawerKeys } from "./drawer-keys.ts";
import { useSidebarKeys } from "./use-sidebar-keys.ts";

interface SidebarKeysProps {
  readonly keymap: Keymap;
  readonly layout: Layout;
  readonly me: string;
  readonly scheduleList: ScheduleList;
  readonly unread: Unread;
}

export function SidebarKeys(props: SidebarKeysProps): ReactNode {
  useDrawerKeys(props);
  useSidebarKeys(props);
  return null;
}
