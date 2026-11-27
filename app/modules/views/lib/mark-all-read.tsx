import type { Unread, UnreadState } from "../../unread/index.ts";
import { Button } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { besideCountOf } from "./beside-count.ts";

const NONE = 0;

const TEXT = { markAll: "Mark all as read" } as const;

type LoadedState = Extract<UnreadState, { readonly status: "loaded" }>;

interface MarkAllReadProps {
  readonly state: LoadedState;
  readonly unread: Unread;
}

export function MarkAllRead(props: MarkAllReadProps): ReactNode {
  const { state } = props;
  const handleClick = props.unread.markAllRead;
  return (
    <Button
      unavailable={state.items.length + besideCountOf(state) === NONE || state.markAll.status === "marking"}
      onClick={handleClick}
    >
      {TEXT.markAll}
    </Button>
  );
}
