import { ChannelPanes } from "./channel-panes.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import { NotBuiltView } from "../../views/index.tsx";
import { PagePanes } from "./page-panes.tsx";
import { PeoplePanes } from "./people-panes.tsx";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import type { Stores } from "./stores.ts";

const TEXT = { missing: "No page has this address.", nothing: "Nothing here" } as const;

interface RoutePanesProps {
  readonly me: IdentityName;
  readonly route: Route;
  readonly stores: Stores;
}

type PeopleRoute = Extract<Route, { readonly name: "people" | "profile" }>;

type ChannelRoute = Extract<Route, { readonly name: "channel" | "thread" }>;

type PageRoute = Extract<Route, { readonly name: "inbox" | "login" | "settings" }>;

function isPage(route: Route): route is PageRoute {
  return route.name === "inbox" || route.name === "login" || route.name === "settings";
}

function isPeople(route: Route): route is PeopleRoute {
  return route.name === "people" || route.name === "profile";
}

function isChannel(route: Route): route is ChannelRoute {
  return route.name === "channel" || route.name === "thread";
}

export function RoutePanes(props: RoutePanesProps): ReactNode {
  const { route, stores } = props;
  if (isPage(route)) {
    return <PagePanes me={props.me} route={route} stores={stores} />;
  }
  if (isPeople(route)) {
    return <PeoplePanes composer={stores.composer} layout={stores.layout} me={props.me} route={route} />;
  }
  if (isChannel(route)) {
    return (
      <ChannelPanes
        board={stores.board}
        composer={stores.composer}
        key={route.channel}
        layout={stores.layout}
        me={props.me}
        route={route}
        unread={stores.unread}
      />
    );
  }
  return <NotBuiltView description={TEXT.missing} title={TEXT.nothing} />;
}
