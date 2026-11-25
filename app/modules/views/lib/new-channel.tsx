import type { ChannelCreation } from "../../board/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { NewChannelForm } from "./new-channel-form.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

interface NewChannelProps {
  readonly creation: ChannelCreation;
  readonly keymap: Keymap;
}

export function NewChannel(props: NewChannelProps): ReactNode {
  const { creation } = props;
  const state = useSyncExternalStore(creation.subscribe, creation.snapshot);
  return state.open && <NewChannelForm creation={creation} keymap={props.keymap} state={state} />;
}
