import { ChannelView, ThreadCardComposer, ThreadView } from "../../views/index.tsx";
import type { Board } from "../../board/index.ts";
import type { Composer } from "../../composer/index.ts";
import { IdentityCardComposer } from "../../design-system/index.tsx";
import type { Layout } from "../../layout/index.ts";
import type { MessageId } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { Unread } from "../../unread/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useThreadEdge } from "./use-thread-edge.ts";

interface ChannelPanesProps {
  readonly board: Board;
  readonly composer: Composer;
  readonly layout: Layout;
  readonly route: Extract<Route, { readonly name: "channel" | "thread" }>;
  readonly unread: Unread;
  readonly me: string;
}

function openThread(route: ChannelPanesProps["route"]): MessageId | null {
  if (route.name === "thread") {
    return route.thread;
  }
  return null;
}

export function ChannelPanes(props: ChannelPanesProps): ReactNode {
  const { board, composer, me, route, unread } = props;
  const edge = useThreadEdge({ closeHref: hrefOf({ channel: route.channel, name: "channel" }), layout: props.layout });
  return (
    <>
      <IdentityCardComposer value={composer.channelDraft(route.channel).replyTo}>
        <ChannelView
          board={board}
          channel={route.channel}
          composer={composer}
          me={me}
          open={openThread(route)}
          newLine={unread.newLine(route.channel, null)}
          unread={unread}
        />
      </IdentityCardComposer>
      {route.name === "thread" && (
        <ThreadCardComposer
          board={board}
          channel={route.channel}
          composer={composer}
          key={String(route.thread)}
          me={me}
          thread={route.thread}
        >
          <ThreadView
            board={board}
            channel={route.channel}
            composer={composer}
            edge={edge}
            linked={route.message ?? null}
            me={me}
            thread={route.thread}
            unread={unread}
          />
        </ThreadCardComposer>
      )}
    </>
  );
}
