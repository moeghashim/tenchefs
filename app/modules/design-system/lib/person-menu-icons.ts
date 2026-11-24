import { ChatIcon } from "./chat-icon.tsx";
import { CopyIcon } from "./copy-icon.tsx";
import { PersonIcon } from "./person-icon.tsx";

export const PERSON_MENU_ICONS = {
  "copy-name": CopyIcon,
  message: ChatIcon,
  "view-profile": PersonIcon,
} as const;
