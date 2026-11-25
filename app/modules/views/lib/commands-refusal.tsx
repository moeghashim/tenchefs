import { Alert } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useCommands } from "./use-board.ts";

export function CommandsRefusal(): ReactNode {
  const listed = useCommands();
  if (listed.status !== "failed") {
    return null;
  }
  return <Alert>{`Couldn't list the commands (${listed.code}): ${listed.message}`}</Alert>;
}
