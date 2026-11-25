import { Alert } from "../../design-system/content.tsx";
import type { ChannelMessagesState } from "../../board/index.ts";
import { QuietButton } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";

type OlderState = Extract<ChannelMessagesState, { readonly status: "loaded" }>["older"];

const TEXT = { idle: "Load older messages", loading: "Loading…" } as const;

interface OlderProps {
  readonly older: OlderState;
  readonly onLoad: () => void;
  readonly feed: string;
}

export function Older(props: OlderProps): ReactNode {
  const { older } = props;
  const loading = older.status === "loading";
  return (
    <>
      <QuietButton controls={props.feed} disabled={loading} onClick={props.onLoad}>
        {loading && TEXT.loading}
        {!loading && TEXT.idle}
      </QuietButton>
      {older.status === "failed" && <Alert>{`Couldn't load older messages (${older.code}): ${older.message}`}</Alert>}
    </>
  );
}
