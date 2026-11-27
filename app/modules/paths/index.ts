/**
 * The web UI's paths: the one owner of its location hashes. A hash names a
 * `Route` (`#/`, no hash, and `#/inbox` the inbox, `#/inbox/<channel>` the
 * same with that channel's row selected and `#/inbox/<channel>/<thread id>`
 * with that thread's, `#/inbox/<channel>/<thread id>/messages/<message id>` the same
 * with that message in view and highlighted, `#/login`,
 * `#/people` the people and agents, `#/people/<name>` the same with that
 * identity's profile open, `#/settings` the settings page and
 * `#/settings/<section>` the same with the focus on that section (`profile`,
 * `theme`, `agents` or `session`), `#/channels/<name>`,
 * `#/channels/<name>/threads/<id>`, `#/channels/<name>/threads/<id>/messages/<message id>`
 * the same thread scrolled to that message and highlighted (the thread's own ID for its
 * top-level message), and `#/approve` the approval page for a login request or an agent join
 * request, as are `#/approve/<anything>` and `#/approve-join/<anything>`, which carry no code to it); a channel name
 * that isn't a `ChannelName`, an identity name that isn't an `IdentityName`,
 * a thread ID that isn't a message ID, or a section the settings page doesn't
 * have is `missing`; `#/threads` and `#/threads/all`, where the removed Open
 * threads page was, and any hash no page has open the inbox, the homepage.
 * `hrefOf(route)` builds the hash a link to a route
 * goes to, so no view writes a path by hand.
 *
 * Any of those hashes can end in `?profile=<name>`: the same page with that
 * identity's profile panel open beside it. `locationOf(hash)` reads both as a
 * `Place`; a profile opened over a thread replaces the thread's panel, so the
 * place is the channel, and one opened over the people page is the people
 * page's own `profile` route. `profileHref({ identity, route })` builds the
 * link that opens a profile beside `route`, and `closedHref(route)` the one
 * that closes it.
 */
import type { ChannelName, IdentityName } from "../sdk/index.ts";
import { inboxHref, messageIdOf, selectionOf } from "./lib/thread-selection.ts";
import { threadHref, threadMatch } from "./lib/thread-route.ts";
import type { InboxSelection } from "./lib/thread-selection.ts";
import type { ThreadRoute } from "./lib/thread-route.ts";
import { isChannelName } from "../channels/index.ts";
import { isIdentityName } from "../identities/index.ts";

const settingsSections = ["profile", "theme", "agents", "session"] as const;

type SettingsSection = (typeof settingsSections)[number];

type Route =
  | { readonly name: "login" }
  | { readonly name: "settings"; readonly section: SettingsSection | null }
  | { readonly name: "people" }
  | { readonly name: "profile"; readonly identity: IdentityName }
  | { readonly name: "inbox"; readonly selected: InboxSelection | null }
  | { readonly name: "channel"; readonly channel: ChannelName }
  | ThreadRoute
  | { readonly name: "approve" }
  | { readonly name: "missing" };

type LinkedRoute = Extract<
  Route,
  { readonly name: "inbox" | "people" | "profile" | "settings" | "channel" | "thread" }
>;

type Matcher = (hash: string) => Route | false;

const INBOX = /^(?:#\/?|#\/inbox)?$/u;
const INBOX_THREAD = /^#\/inbox\/(?<channel>[^/]+)(?:\/(?<thread>[^/]+))?$/u;
const INBOX_MESSAGE = /^#\/inbox\/(?<channel>[^/]+)\/(?<thread>[^/]+)\/messages\/(?<message>[^/]+)$/u;
const LOGIN = /^#\/login$/u;
const SETTINGS = /^#\/settings$/u;
const SECTION = /^#\/settings\/(?<section>[^/]+)$/u;
const PEOPLE = /^#\/people$/u;
const OLD_OPEN_THREADS = /^#\/threads(?:\/all)?$/u;
const PROFILE = /^#\/people\/(?<identity>[^/]+(?:\/[^/]+)?)$/u;
const CHANNEL = /^#\/channels\/(?<channel>[^/]+)$/u;

const PROFILE_QUERY = /\?profile=(?<profile>[^/?]*(?:\/[^/?]*)?)$/u;
const WITH_PROFILE = /^.*\?profile=(?<profile>[^/?]*(?:\/[^/?]*)?)$/u;
const APPROVE = /^#\/approve(?:-join)?(?:\/[^/]*)?$/u;
const MISSING: Route = { name: "missing" };

function channelRoute(channel: string): Route {
  if (!isChannelName(channel)) {
    return MISSING;
  }
  return { channel, name: "channel" };
}

function profileRoute(identity: string): Route {
  if (!isIdentityName(identity)) {
    return MISSING;
  }
  return { identity, name: "profile" };
}

function sectionRoute(section: string): Route {
  for (const each of settingsSections) {
    if (each === section) {
      return { name: "settings", section: each };
    }
  }
  return MISSING;
}

function inboxRoute(channel: string, thread: string): Route {
  if (thread === "" && isChannelName(channel)) {
    return { name: "inbox", selected: { channel, thread: null } };
  }
  const selected = selectionOf({ channel, thread });
  if (selected === null) {
    return MISSING;
  }
  return { name: "inbox", selected };
}

function inboxMessageRoute(hash: string): Route {
  const selected = selectionOf({
    channel: hash.replace(INBOX_MESSAGE, "$<channel>"),
    thread: hash.replace(INBOX_MESSAGE, "$<thread>"),
  });
  const message = messageIdOf(hash.replace(INBOX_MESSAGE, "$<message>"));
  if (selected === null || message === null) {
    return MISSING;
  }
  return { name: "inbox", selected: { ...selected, message } };
}

const matchers: readonly Matcher[] = [
  (hash) => INBOX.test(hash) && { name: "inbox", selected: null },
  (hash) =>
    INBOX_THREAD.test(hash) &&
    inboxRoute(hash.replace(INBOX_THREAD, "$<channel>"), hash.replace(INBOX_THREAD, "$<thread>")),
  (hash) => INBOX_MESSAGE.test(hash) && inboxMessageRoute(hash),
  (hash) => LOGIN.test(hash) && { name: "login" },
  (hash) => SETTINGS.test(hash) && { name: "settings", section: null },
  (hash) => SECTION.test(hash) && sectionRoute(hash.replace(SECTION, "$<section>")),
  (hash) => PEOPLE.test(hash) && { name: "people" },
  (hash) => OLD_OPEN_THREADS.test(hash) && { name: "inbox", selected: null },
  (hash) => PROFILE.test(hash) && profileRoute(hash.replace(PROFILE, "$<identity>")),
  (hash) => APPROVE.test(hash) && { name: "approve" },
  (hash) => CHANNEL.test(hash) && channelRoute(hash.replace(CHANNEL, "$<channel>")),
  threadMatch,
];

function settingsHref(section: SettingsSection | null): string {
  if (section === null) {
    return "#/settings";
  }
  return `#/settings/${section}`;
}

function channelHref(route: Extract<Route, { readonly name: "channel" | "thread" }>): string {
  if (route.name === "channel") {
    return `#/channels/${route.channel}`;
  }
  return threadHref(route);
}

function pageHref(route: Extract<Route, { readonly name: "settings" | "channel" | "thread" }>): string {
  if (route.name === "settings") {
    return settingsHref(route.section);
  }
  return channelHref(route);
}

interface ProfileLink {
  readonly route: Route;
  readonly identity: IdentityName;
}

interface Place {
  readonly route: Route;
  readonly profile: IdentityName | null;
}

function profileIn(hash: string): IdentityName | null {
  const found = hash.replace(WITH_PROFILE, "$<profile>");
  if (!PROFILE_QUERY.test(hash) || !isIdentityName(found)) {
    return null;
  }
  return found;
}

function besideProfile(route: Route, profile: IdentityName): Place {
  if (route.name === "thread") {
    return { profile, route: { channel: route.channel, name: "channel" } };
  }
  if (route.name === "people" || route.name === "profile") {
    return { profile: null, route: { identity: profile, name: "profile" } };
  }
  return { profile, route };
}

function isLinked(route: Route): route is LinkedRoute {
  return route.name !== "login" && route.name !== "approve" && route.name !== "missing";
}

function routeOf(hash: string): Route {
  for (const matcher of matchers) {
    const route = matcher(hash);
    if (route !== false) {
      return route;
    }
  }
  return { name: "inbox", selected: null };
}

/**
 * Builds the location hash a link to `route` goes to.
 * @param route Where the link goes.
 * @returns The hash, such as `#/channels/general`.
 */
export function hrefOf(route: LinkedRoute): string {
  if (route.name === "inbox") {
    return inboxHref(route.selected);
  }
  if (route.name === "people") {
    return "#/people";
  }
  if (route.name === "profile") {
    return `#/people/${route.identity}`;
  }
  return pageHref(route);
}

/**
 * Reads a location hash as the place it names.
 * @param hash The location hash, `#` included (or empty).
 * @returns The route, and the profile open beside it.
 */
export function locationOf(hash: string): Place {
  const route = routeOf(hash.replace(PROFILE_QUERY, ""));
  const profile = profileIn(hash);
  if (profile === null || route.name === "missing") {
    return { profile: null, route };
  }
  return besideProfile(route, profile);
}

/**
 * Builds the location hash that opens `identity`'s profile panel beside `route`.
 * @param link The page the panel opens on (`route`) and whose profile it is (`identity`).
 * @returns The hash, such as `#/channels/general?profile=alice`.
 */
export function profileHref(link: ProfileLink): string {
  const { identity } = link;
  const { route: shown } = besideProfile(link.route, identity);
  if (!isLinked(shown) || shown.name === "profile") {
    return hrefOf({ identity, name: "profile" });
  }
  return `${hrefOf(shown)}?profile=${identity}`;
}

/**
 * Builds the location hash that closes a profile panel open beside `route`.
 * @param route The page the panel is open on.
 * @returns The page's own hash, or the people page's for a page links don't go to.
 */
export function closedHref(route: Route): string {
  if (!isLinked(route)) {
    return hrefOf({ name: "people" });
  }
  return hrefOf(route);
}

export type { LinkedRoute, Place, Route, SettingsSection };
export type { InboxSelection, InboxThreadSelection, ThreadSelection } from "./lib/thread-selection.ts";
