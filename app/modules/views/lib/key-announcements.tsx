import { Announcement } from "../../design-system/content.tsx";
import type { Keymap } from "../../keymap/index.ts";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface KeyAnnouncementsProps {
  readonly keymap: Keymap;
}

export function KeyAnnouncements(props: KeyAnnouncementsProps): ReactNode {
  const { keymap } = props;
  const { announced } = useSyncExternalStore(keymap.subscribe, keymap.snapshot);
  return <Announcement said={announced} />;
}
