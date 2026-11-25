import { LinkedMessage } from "./linked-message.ts";
import type { MessageId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { ScrollArea } from "../../design-system/layout.tsx";

interface LinkedScrollProps {
  readonly count: number;
  readonly label: string;
  readonly highlighted: MessageId | null;
  readonly children: ReactNode;
}

export function LinkedScroll(props: LinkedScrollProps): ReactNode {
  return (
    <LinkedMessage value={props.highlighted}>
      <ScrollArea count={props.count} label={props.label}>
        {props.children}
      </ScrollArea>
    </LinkedMessage>
  );
}
