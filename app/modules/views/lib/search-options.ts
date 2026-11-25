import type { Identity, MessageId, SearchResult } from "../../sdk/index.ts";
import type { ChannelsState } from "../../board/index.ts";
import type { SearchState } from "../../search/web.ts";
import { hrefOf } from "../../paths/index.ts";
import { parseQuery } from "../../search/index.ts";

type JumpGroup = "Channels" | "People" | "Places";

type BoxOption =
  | {
      readonly kind: "jump";
      readonly group: JumpGroup;
      readonly label: string;
      readonly detail: string | null;
      readonly href: string;
    }
  | { readonly kind: "message"; readonly group: "Messages"; readonly result: SearchResult; readonly href: string };

interface Listed {
  readonly channels: ChannelsState;
  readonly identities: readonly Identity[];
  readonly results: readonly SearchResult[];
  readonly state: SearchState;
}

const MOST_PER_GROUP = 5;
const FIRST = 0;
const NONE = 0;

const PLACES: readonly BoxOption[] = [
  { detail: null, group: "Places", href: hrefOf({ name: "inbox", selected: null }), kind: "jump", label: "Inbox" },
  { detail: null, group: "Places", href: hrefOf({ name: "people" }), kind: "jump", label: "People" },
  {
    detail: null,
    group: "Places",
    href: hrefOf({ name: "settings", section: null }),
    kind: "jump",
    label: "Settings",
  },
];

function searchHrefOf({ message }: SearchResult): string {
  if (message.kind === "reply") {
    return hrefOf({ channel: message.channel, message: message.id, name: "thread", thread: message.replyTo });
  }
  return hrefOf({ channel: message.channel, name: "thread", thread: message.id });
}

function includes(text: string, typed: string): boolean {
  return text.toLowerCase().includes(typed);
}

function channelsOf(channels: ChannelsState, typed: string): readonly BoxOption[] {
  if (channels.status !== "loaded" || typed === "") {
    return [];
  }
  return channels.channels
    .filter((channel) => includes(channel.name, typed))
    .slice(FIRST, MOST_PER_GROUP)
    .map((channel) => ({
      detail: null,
      group: "Channels",
      href: hrefOf({ channel: channel.name, name: "channel" }),
      kind: "jump",
      label: `#${channel.name}`,
    }));
}

function displayNameOf(identity: Identity): string {
  return identity.displayName ?? identity.name;
}

function detailOf(identity: Identity): string | null {
  if (typeof identity.displayName !== "string") {
    return null;
  }
  return identity.name;
}

function peopleOf(identities: readonly Identity[], typed: string): readonly BoxOption[] {
  if (typed === "") {
    return [];
  }
  return identities
    .filter((identity) => identity.deactivated !== true)
    .filter((identity) => [identity.name, identity.displayName ?? ""].some((each) => includes(each, typed)))
    .slice(FIRST, MOST_PER_GROUP)
    .map((identity) => ({
      detail: detailOf(identity),
      group: "People",
      href: hrefOf({ identity: identity.name, name: "profile" }),
      kind: "jump",
      label: displayNameOf(identity),
    }));
}

function messagesOf(results: readonly SearchResult[]): readonly BoxOption[] {
  return results.map((result) => ({
    group: "Messages",
    href: searchHrefOf(result),
    kind: "message",
    result,
  }));
}

function isFiltered(query: string): boolean {
  const { after, before, from, in: within } = parseQuery(query);
  return [after, before, from, within].some((values) => values.length > NONE);
}

function boxOptionsOf({ channels, identities, results, state }: Listed): readonly BoxOption[] {
  if (isFiltered(state.query)) {
    return messagesOf(results);
  }
  const typed = state.query.trim().toLowerCase();
  return [
    ...PLACES.filter((place) => place.kind === "jump" && includes(place.label, typed)),
    ...channelsOf(channels, typed),
    ...peopleOf(identities, typed),
    ...messagesOf(results),
  ];
}

const NO_IDS: readonly MessageId[] = [];

function foundIdsOf(state: SearchState): readonly MessageId[] {
  if (state.found.status !== "found") {
    return NO_IDS;
  }
  return state.found.ids;
}

function aheadOf(options: readonly BoxOption[]): number {
  return options.filter((option) => option.kind === "jump").length;
}

export { type BoxOption, aheadOf, boxOptionsOf, foundIdsOf };
