import { ChannelView, ThreadCardComposer, ThreadView } from "../../views/index.tsx";
import type { ComponentProps, ReactNode } from "react";
import type { Composer } from "../../composer/index.ts";
import { IdentityCardComposer } from "../../design-system/messages.tsx";
import type { Layout } from "../../layout/index.ts";
import type { MessageId } from "../../sdk/index.ts";
import type { Route } from "../../paths/index.ts";
import type { Scheduling } from "../../board/index.ts";
import type { Unread } from "../../unread/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useThreadEdge } from "./use-thread-edge.ts";

interface ChannelPanesProps {
  readonly scheduling: Scheduling;
  readonly composer: Composer;
  readonly keymap: ComponentProps<typeof ChannelView>["keymap"];
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
  const { composer, me, route, unread } = props;
  const alone = route.name === "thread" && route.alone === true;
  const edge = useThreadEdge({ closeHref: hrefOf({ channel: route.channel, name: "channel" }), layout: props.layout });
  return (
    <>
      {!alone && (
        <IdentityCardComposer value={composer.channelDraft(route.channel).replyTo}>
          <ChannelView
            channel={route.channel}
            composer={composer}
            keymap={props.keymap}
            me={me}
            open={openThread(route)}
            newLine={unread.newLine(route.channel, null)}
            scheduling={props.scheduling}
            unread={unread}
          />
        </IdentityCardComposer>
      )}
      {route.name === "thread" && (
        <ThreadCardComposer
          channel={route.channel}
          composer={composer}
          key={String(route.thread)}
          me={me}
          thread={route.thread}
        >
          <ThreadView
            alone={alone}
            channel={route.channel}
            composer={composer}
            edge={edge}
            keymap={props.keymap}
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
