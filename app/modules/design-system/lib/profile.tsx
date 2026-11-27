import { Avatar } from "./avatar.tsx";
import type { ProfileParts } from "./parts.ts";
import type { ReactNode } from "react";

export function Profile(parts: ProfileParts): ReactNode {
  return (
    <div className="flex shrink-0 items-start gap-4 px-5 pt-5 pb-3">
      <Avatar agent={parts.agent} name={parts.name} presence={parts.presence} size="large" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">{parts.children}</div>
    </div>
  );
}
