import { Array as Arr, Effect, Option, String as Str } from "effect";
import type { Message, MessageId } from "../../../messages/index.ts";
import type {
  NewMessage,
  SearchPageRequest,
  SearchQuery,
  Storage,
  StorageUnavailable,
} from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  channelName,
  identityFixture,
  identityName,
  isoTime,
  newMessageFixture,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import type { NewMessageOptions } from "../../../testing/server.ts";
import { parseQuery } from "../../../search/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const ADA = identityName("ada");
const EVERY = { limit: 50 } as const;
const PAGE_OF_TWO = 2;
const LONG_WORD = 3000;
const HALF = 2;
const HASH_LENGTH = 64;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const MONDAY = isoTime("2026-01-05T00:00:00.000Z");
const TUESDAY = isoTime("2026-01-06T00:00:00.000Z");
const WEDNESDAY = isoTime("2026-01-07T00:00:00.000Z");
const THURSDAY = isoTime("2026-01-08T00:00:00.000Z");
const FRIDAY = isoTime("2026-01-09T00:00:00.000Z");
const SATURDAY = isoTime("2026-01-10T00:00:00.000Z");
const BY_ADA = { author: { name: "ada" } } as const;

type SearchPage = Effect.Success<ReturnType<Storage["Service"]["searchMessages"]>>;

interface Board {
  readonly storage: Storage["Service"];
  readonly post: (at: NewMessage["createdAt"], text: string, options?: NewMessageOptions) => Effect.Effect<Message>;
  readonly postIn: (name: string, text: string) => Effect.Effect<Message>;
  readonly ids: (query: string) => Effect.Effect<readonly MessageId[], StorageUnavailable>;
}

function wordsOf(query: string): SearchQuery {
  return { authors: [], channels: [], words: parseQuery(query).words };
}

function newMessage(at: NewMessage["createdAt"], text: string, options: NewMessageOptions = {}): NewMessage {
  return { ...newMessageFixture("grill", text, options), createdAt: at };
}

function aBoard<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Board, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openBoard() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createChannel(channel("deploys"));
    yield* storage.createIdentity(identityFixture("ada"), tokenHash(Str.repeat(HASH_LENGTH)("a")));
    const append = appendTo(storage);
    return {
      ids: (query) =>
        Effect.map(storage.searchMessages(wordsOf(query), EVERY), ({ results }) =>
          Arr.map(results, ({ message }) => message.id),
        ),
      post: (at, text, options) => append(newMessage(at, text, options)),
      postIn: (name, text) => append({ ...newMessageFixture(name, text), createdAt: MONDAY }),
      storage,
    };
  });
}

function afterLastOf(page: SearchPage): Pick<SearchPageRequest, "after"> {
  return Option.match(Arr.last(page.results), {
    onNone: () => ({}),
    onSome: ({ message }) => ({ after: { createdAt: message.createdAt, id: message.id } }),
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a word finds the words it starts, without case or accents, newest first",
  ({ layer }) =>
    Effect.gen(function* wordsAndPrefixes() {
      const { ids, post } = yield* aBoard(layer);
      const [deploy, deployment, , cafe, login] = yield* Effect.forEach(
        [
          [MONDAY, "Time to deploy"],
          [TUESDAY, "The deployment failed"],
          [WEDNESDAY, "redeploy later"],
          [THURSDAY, "Meet at the cafe"],
          [FRIDAY, "The **login** page, @grace #grill"],
        ] as const,
        ([at, text]) => Effect.map(post(at, text), ({ id }) => id),
        ONE_AT_A_TIME,
      );
      const found = yield* Effect.all(
        {
          accented: ids("Café"),
          inMarkdown: ids("login"),
          longer: ids("deployments"),
          mentioned: ids("grace"),
          prefix: ids("deplo"),
          tagged: ids("grill"),
          upperCase: ids("DEPLOY"),
        },
        ONE_AT_A_TIME,
      );

      expect(found).toStrictEqual({
        accented: [cafe],
        inMarkdown: [login],
        longer: [],
        mentioned: [login],
        prefix: [deployment, deploy],
        tagged: [login],
        upperCase: [deployment, deploy],
      });
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): a query with no words finds every message", ({ layer }) =>
  Effect.gen(function* noWords() {
    const { ids, post } = yield* aBoard(layer);
    const first = yield* post(MONDAY, "first");
    const reply = yield* post(TUESDAY, "a reply", { replyTo: first.id });
    const found = yield* ids("");

    expect(found).toStrictEqual([reply.id, first.id]);
  }),
);

it.effect.each(storageLayers)("storage contract ($adapter): every word of a query must match", ({ layer }) =>
  Effect.gen(function* everyWord() {
    const { ids, post } = yield* aBoard(layer);
    const first = yield* post(MONDAY, "the login is flaky");
    const second = yield* post(TUESDAY, "flaky login again");
    const deploy = yield* post(WEDNESDAY, "a flaky deploy");
    const found = yield* Effect.all([ids("flaky login"), ids("flak deploy"), ids("flaky nothing")], ONE_AT_A_TIME);

    expect(found).toStrictEqual([[second.id, first.id], [deploy.id], []]);
  }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): replies and messages in Closed threads are found, and say their thread is Closed",
  ({ layer }) =>
    Effect.gen(function* closedThreads() {
      const { post, storage } = yield* aBoard(layer);
      const parent = yield* post(MONDAY, "deploy plan");
      const reply = yield* post(TUESDAY, "deploy done", { replyTo: parent.id });
      const open = yield* post(WEDNESDAY, "deploy next");
      yield* post(THURSDAY, "reply in an open thread", { replyTo: open.id });
      yield* storage.closeThread(parent.id, { closedAt: FRIDAY, closedBy: ADA });
      const page = yield* storage.searchMessages(wordsOf("deploy"), EVERY);

      expect(page).toMatchObject({
        hasMore: false,
        results: [
          { message: { id: open.id, kind: "top-level", replyCount: 1 }, threadClosed: false },
          { message: { id: reply.id, kind: "reply", replyTo: parent.id }, threadClosed: true },
          { message: { closedAt: FRIDAY, closedBy: ADA, id: parent.id, replyCount: 1 }, threadClosed: true },
        ],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a message is found as soon as it is stored, and a deleted channel's are gone",
  ({ layer }) =>
    Effect.gen(function* inStep() {
      const { ids, postIn, storage } = yield* aBoard(layer);
      const kept = yield* postIn("grill", "freeze the grill");
      const before = yield* ids("freeze");
      const gone = yield* postIn("deploys", "freeze deploys");
      const found = yield* ids("freeze");
      const after = yield* Effect.andThen(storage.deleteChannel(channelName("deploys")), ids("freeze"));

      expect([before, found, after]).toStrictEqual([[kept.id], [gone.id, kept.id], [kept.id]]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a Deactivated author's messages are still found",
  ({ layer }) =>
    Effect.gen(function* deactivatedAuthor() {
      const { ids, post, storage } = yield* aBoard(layer);
      const said = yield* post(MONDAY, "the freeze is over", BY_ADA);
      const found = yield* Effect.andThen(storage.deactivateIdentity(ADA), ids("freeze"));

      expect(found).toStrictEqual([said.id]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): newest-first pages neither repeat nor skip a result when a message is posted between them",
  ({ layer }) =>
    Effect.gen(function* paging() {
      const { post, storage } = yield* aBoard(layer);
      const sent = yield* Effect.forEach(
        [MONDAY, TUESDAY, WEDNESDAY, THURSDAY],
        (at) => Effect.map(post(at, "flaky test"), ({ id }) => id),
        ONE_AT_A_TIME,
      );
      const query = wordsOf("flaky");
      const first = yield* storage.searchMessages(query, { limit: PAGE_OF_TWO });
      const second = yield* Effect.andThen(
        post(SATURDAY, "flaky again"),
        storage.searchMessages(query, { ...afterLastOf(first), limit: PAGE_OF_TWO }),
      );
      const pages = Arr.map([...first.results, ...second.results], ({ message }) => message.id);

      expect({ first: first.hasMore, pages, second: second.hasMore }).toStrictEqual({
        first: true,
        pages: Arr.reverse(sent),
        second: false,
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a message with a word of thousands of characters is stored, and found by that word or its start",
  ({ layer }) =>
    Effect.gen(function* longWord() {
      const { ids, post } = yield* aBoard(layer);
      const word = Str.repeat(LONG_WORD)("é");
      const said = yield* post(MONDAY, `the hash ${word}`);
      const found = yield* Effect.all([ids(word), ids(Str.repeat(LONG_WORD / HALF)("e")), ids("hash")], ONE_AT_A_TIME);

      expect(found).toStrictEqual([[said.id], [said.id], [said.id]]);
    }),
);
