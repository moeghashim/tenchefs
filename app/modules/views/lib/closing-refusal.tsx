import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useClosingRefusal } from "./use-board.ts";

export function ClosingRefusal(): ReactNode {
  const refusal = useClosingRefusal();
  if (refusal === null) {
    return null;
  }
  return <Alert>{`Couldn't ${refusal.action} the thread (${refusal.code}): ${refusal.message}`}</Alert>;
}
