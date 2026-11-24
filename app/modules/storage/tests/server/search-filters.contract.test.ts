import { Array as Arr, Effect } from "effect";
import type { NewMessage, SearchQuery, Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  channelName,
  identityName,
  isoTime,
  newMessageFixture,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import type { MessageId } from "../../../messages/index.ts";
import { dateBoundsOf } from "../../../search/server.ts";
import { parseQuery } from "../../../search/index.ts";

const EVERY = { limit: 50 } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const MONDAY = isoTime("2026-01-05T00:00:00.000Z");
const TUESDAY = isoTime("2026-01-06T00:00:00.000Z");
const WEDNESDAY = isoTime("2026-01-07T00:00:00.000Z");
const ADA = { author: { name: "ada" } } as const;
const AGENT = { author: { name: "agent" } } as const;

interface Post {
  readonly at: NewMessage["createdAt"];
  readonly text: string;
  readonly in?: string;
  readonly by?: typeof ADA | typeof AGENT;
}

interface Board {
  readonly post: (post: Post) => Effect.Effect<MessageId>;
  readonly ids: (query: string) => Effect.Effect<readonly MessageId[], StorageUnavailable>;
}

function filteredBy(query: string): SearchQuery {
  const parsed = parseQuery(query);
  return {
    ...dateBoundsOf(parsed),
    authors: Arr.map(parsed.from, identityName),
    channels: Arr.map(parsed.in, channelName),
    words: parsed.words,
  };
}

function aBoard<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Board, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openBoard() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createChannel(channel("deploys"));
    const append = appendTo(storage);
    return {
      ids: (query) =>
        Effect.map(storage.searchMessages(filteredBy(query), EVERY), ({ results }) =>
          Arr.map(results, ({ message }) => message.id),
        ),
      post: ({ at, by = AGENT, in: name = "grill", text }) =>
        Effect.map(append({ ...newMessageFixture(name, text, by), createdAt: at }), ({ id }) => id),
    };
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): each filter narrows, filters combine with each other and with words, and repeated authors or channels match any",
  ({ layer }) =>
    Effect.gen(function* filters() {
      const { ids, post } = yield* aBoard(layer);
      const plan = yield* post({ at: MONDAY, by: ADA, text: "deploy plan" });
      const elsewhere = yield* post({ at: MONDAY, by: ADA, in: "deploys", text: "deploy in deploys" });
      const done = yield* post({ at: TUESDAY, text: "deploy done" });
      const lunch = yield* post({ at: WEDNESDAY, by: ADA, text: "lunch" });
      const found = yield* Effect.all(
        {
          author: ids("from:ada"),
          authorAndChannel: ids("from:ada in:grill"),
          authorAndWord: ids("deploy from:ada"),
          authorSince: ids("from:ada after:2026-01-05"),
          channel: ids("in:deploys"),
          eitherAuthor: ids("from:ada from:agent deploy"),
          eitherChannel: ids("in:grill in:deploys deploy"),
        },
        ONE_AT_A_TIME,
      );

      expect(found).toStrictEqual({
        author: [lunch, elsewhere, plan],
        authorAndChannel: [lunch, plan],
        authorAndWord: [elsewhere, plan],
        authorSince: [lunch],
        channel: [elsewhere],
        eitherAuthor: [done, elsewhere, plan],
        eitherChannel: [done, elsewhere, plan],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): before: and after: leave out the UTC day they name, from midnight to midnight",
  ({ layer }) =>
    Effect.gen(function* dates() {
      const { ids, post } = yield* aBoard(layer);
      const [mondayEnd, tuesdayStart, tuesdayEnd, wednesdayStart] = yield* Effect.forEach(
        [isoTime("2026-01-05T23:59:59.999Z"), TUESDAY, isoTime("2026-01-06T23:59:59.999Z"), WEDNESDAY],
        (at) => post({ at, text: "deploy" }),
        ONE_AT_A_TIME,
      );
      const found = yield* Effect.all(
        {
          after: ids("after:2026-01-06"),
          before: ids("before:2026-01-06"),
          between: ids("after:2026-01-05 before:2026-01-07"),
          narrowest: ids("after:2026-01-01 after:2026-01-05 before:2026-01-07 before:2026-01-09"),
        },
        ONE_AT_A_TIME,
      );

      expect(found).toStrictEqual({
        after: [wednesdayStart],
        before: [mondayEnd],
        between: [tuesdayEnd, tuesdayStart],
        narrowest: [tuesdayEnd, tuesdayStart],
      });
    }),
);
