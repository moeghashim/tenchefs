import { CheckCircleIcon } from "./check-circle-icon.tsx";
import { CopyIcon } from "./copy-icon.tsx";
import { RotateIcon } from "./rotate-icon.tsx";

export const THREAD_MENU_ICONS = {
  close: CheckCircleIcon,
  "copy-link": CopyIcon,
  reopen: RotateIcon,
} as const;
