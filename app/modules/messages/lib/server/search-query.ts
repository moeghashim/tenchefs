import { Effect, Option, Predicate } from "effect";
import type { SearchQuery, StorageUnavailable } from "../../../storage/server.ts";
import { dateBoundsOf, invalidDateFilter } from "../../../search/server.ts";
import { isEmptyQuery, parseQuery } from "../../../search/index.ts";
import type { ParsedQuery } from "../../../search/index.ts";
import type { Refusal } from "../../../http/index.ts";
import { Storage } from "../../../storage/server.ts";
import { isChannelName } from "../../../channels/index.ts";
import { isIdentityName } from "../../../identities/index.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;
const BAD_REQUEST = 400;

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable, Storage>;

function refused(code: Refusal["code"], message: string): Refusal {
  return { code, message, status: BAD_REQUEST };
}

const emptyQuery = refused(
  "empty_query",
  "A search needs at least one word (letters or digits) or filter (from:, in:, before:, after:).",
);

interface Known<Name extends string> {
  readonly isName: (value: string) => value is Name;
  readonly find: (storage: Storage["Service"], name: Name) => Effect.Effect<unknown, StorageUnavailable>;
  readonly unknown: (typed: string) => Refusal;
}

function known<Name extends string>({ find, isName, unknown }: Known<Name>): (typed: string) => Fails<Name> {
  return (typed) =>
    Effect.gen(function* knownName() {
      if (!isName(typed)) {
        return yield* Effect.fail(unknown(typed));
      }
      const storage = yield* Storage;
      const found = yield* find(storage, typed);
      if (Predicate.isUndefined(found)) {
        return yield* Effect.fail(unknown(typed));
      }
      return typed;
    });
}

const knownAuthor = known({
  find: (storage, name) => storage.findIdentityByName(name),
  isName: isIdentityName,
  unknown: (typed) => refused("unknown_identity", `from:@${typed} names no identity on this board.`),
});

const knownChannel = known({
  find: (storage, name) => storage.findChannel(name),
  isName: isChannelName,
  unknown: (typed) => refused("unknown_channel", `in:#${typed} names no channel on this board.`),
});

function parsedOf(query: string): Effect.Effect<ParsedQuery, Refusal> {
  const parsed = parseQuery(query);
  if (isEmptyQuery(parsed)) {
    return Effect.fail(emptyQuery);
  }
  return Option.match(invalidDateFilter(parsed), {
    onNone: () => Effect.succeed(parsed),
    onSome: (filter) => Effect.fail(refused("invalid_date", `${filter} is not a real day: write it as YYYY-MM-DD.`)),
  });
}

function searchQueryOf(query: string): Fails<SearchQuery> {
  return Effect.gen(function* resolveFilters() {
    const parsed = yield* parsedOf(query);
    const authors = yield* Effect.forEach(parsed.from, knownAuthor, ONE_AT_A_TIME);
    const channels = yield* Effect.forEach(parsed.in, knownChannel, ONE_AT_A_TIME);
    return { ...dateBoundsOf(parsed), authors, channels, words: parsed.words };
  });
}

export { searchQueryOf };
