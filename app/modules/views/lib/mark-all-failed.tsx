import { Alert } from "../../design-system/content.tsx";
import type { MarkAllState } from "../../unread/index.ts";
import type { ReactNode } from "react";

interface MarkAllFailedProps {
  readonly markAll: MarkAllState;
}

export function MarkAllFailed(props: MarkAllFailedProps): ReactNode {
  const { markAll } = props;
  if (markAll.status !== "failed") {
    return null;
  }
  return <Alert>{`Couldn't mark all as read (${markAll.code}): ${markAll.message}`}</Alert>;
}
