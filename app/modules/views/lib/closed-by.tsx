import type { Closing } from "../../messages/index.ts";
import { QuietLink } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useProfileHref } from "./profile-base.ts";
import { useTimeAgo } from "./use-time-ago.ts";

interface ClosedByProps {
  readonly closing: Closing;
}

export function ClosedBy({ closing }: ClosedByProps): ReactNode {
  const profileOf = useProfileHref();
  const ago = useTimeAgo(closing.closedAt);
  return (
    <>
      {"Closed by "}
      <QuietLink href={profileOf(closing.closedBy)}>{`@${closing.closedBy}`}</QuietLink>
      {` ${ago}`}
    </>
  );
}
