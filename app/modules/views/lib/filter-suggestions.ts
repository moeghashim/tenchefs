import type { ChannelsState } from "../../board/index.ts";
import type { Identity } from "../../sdk/index.ts";
import type { RecentDay } from "../../format/index.ts";
import type { SearchState } from "../../search/web.ts";
import { channelOrder } from "./channel-order.ts";

interface FilterSuggestion {
  readonly start: number;
  readonly filter: string;
  readonly option: string;
  readonly detail: string | null;
  readonly identity: Identity | null;
}

interface Suggesting {
  readonly channels: ChannelsState;
  readonly identities: readonly Identity[];
  readonly state: Pick<SearchState, "caret" | "query">;
  readonly days: readonly RecentDay[];
}

interface Typed {
  readonly start: number;
  readonly prefix: string;
}

interface Picked {
  readonly query: string;
  readonly caret: number;
}

type Kind = "after" | "before" | "from" | "in";

const MOST_SUGGESTIONS = 8;
const FIRST = 0;
const SPACE = " ";
const LEADING_SPACE = /^\s+/u;

interface Filter {
  readonly kind: Kind;
  readonly typed: Readonly<RegExp>;
  readonly head: Readonly<RegExp>;
}

const FILTERS: readonly Filter[] = [
  { head: /^from:@?/iu, kind: "from", typed: /(?<!\S)from:@?\S*$/iu },
  { head: /^in:#?/iu, kind: "in", typed: /(?<!\S)in:#?\S*$/iu },
  { head: /^before:/iu, kind: "before", typed: /(?<!\S)before:\S*$/iu },
  { head: /^after:/iu, kind: "after", typed: /(?<!\S)after:\S*$/iu },
];

function typedOf(before: string, filter: Filter): Typed | null {
  const found = filter.typed.exec(before);
  if (found === null) {
    return null;
  }
  const [token] = found;
  return { prefix: token.replace(filter.head, "").toLowerCase(), start: found.index };
}

function identitiesOf(identities: readonly Identity[], typed: Typed): readonly FilterSuggestion[] {
  return identities
    .filter((identity) =>
      [identity.name, identity.displayName ?? ""].some((each) => each.toLowerCase().startsWith(typed.prefix)),
    )
    .map((identity) => ({
      detail: identity.displayName ?? null,
      filter: `from:@${identity.name}`,
      identity,
      option: `@${identity.name}`,
      start: typed.start,
    }));
}

function channelsOf(channels: ChannelsState, typed: Typed): readonly FilterSuggestion[] {
  return channelOrder(channels)
    .filter((name) => name.startsWith(typed.prefix))
    .map((name) => ({ detail: null, filter: `in:#${name}`, identity: null, option: `#${name}`, start: typed.start }));
}

function datesOf(kind: "after" | "before", days: readonly RecentDay[], typed: Typed): readonly FilterSuggestion[] {
  return days
    .filter(({ date }) => date.startsWith(typed.prefix))
    .map(({ date, label }) => ({
      detail: label,
      filter: `${kind}:${date}`,
      identity: null,
      option: date,
      start: typed.start,
    }));
}

function suggestionsFor(kind: Kind, suggesting: Suggesting, typed: Typed): readonly FilterSuggestion[] {
  if (kind === "from") {
    return identitiesOf(suggesting.identities, typed);
  }
  if (kind === "in") {
    return channelsOf(suggesting.channels, typed);
  }
  return datesOf(kind, suggesting.days, typed);
}

function filterSuggestionsOf(suggesting: Suggesting): readonly FilterSuggestion[] {
  const before = suggesting.state.query.slice(FIRST, suggesting.state.caret);
  return FILTERS.flatMap((filter) => {
    const typed = typedOf(before, filter);
    if (typed === null) {
      return [];
    }
    return suggestionsFor(filter.kind, suggesting, typed);
  }).slice(FIRST, MOST_SUGGESTIONS);
}

interface Picking {
  readonly state: Pick<SearchState, "caret" | "query">;
  readonly suggestion: FilterSuggestion;
}

function pickedOf({ state, suggestion }: Picking): Picked {
  const head = `${state.query.slice(FIRST, suggestion.start)}${suggestion.filter}${SPACE}`;
  return { caret: head.length, query: head + state.query.slice(state.caret).replace(LEADING_SPACE, "") };
}

export { type FilterSuggestion, filterSuggestionsOf, pickedOf };
