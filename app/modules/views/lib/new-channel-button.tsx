import type { ChannelCreation } from "../../board/index.ts";
import { HeadingButton } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { create: "New channel" } as const;

interface NewChannelButtonProps {
  readonly creation: ChannelCreation;
}

export function NewChannelButton(props: NewChannelButtonProps): ReactNode {
  const { creation } = props;
  const state = useSyncExternalStore(creation.subscribe, creation.snapshot);
  const handleOpen = creation.open;
  return <HeadingButton expanded={state.open} focused={state.cancelled} label={TEXT.create} onClick={handleOpen} />;
}
