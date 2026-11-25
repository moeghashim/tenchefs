import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useReactionRefusal } from "./use-reactions.ts";

export function ReactionRefusal(): ReactNode {
  const refusal = useReactionRefusal();
  if (refusal === null) {
    return null;
  }
  return <Alert>{`Couldn't react to the message (${refusal.code}): ${refusal.message}`}</Alert>;
}
