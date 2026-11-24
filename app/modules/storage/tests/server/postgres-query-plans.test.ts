import { Array as Arr, Effect, String as Str } from "effect";
import type { QueryPlan, Storage, StorageUnavailable } from "../../server.ts";
import {
  appendTo,
  channelFixture,
  channelName,
  freshPostgresQueryPlans,
  identityName,
  isoTime,
  messageId,
  newMessageFixture,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { parseQuery } from "../../../search/index.ts";

const NONE = 0;
const SECOND = 2;
const EVERY = { limit: 50 } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const MATCHES_WORDS = "message_search_words(text) @@";
const SEARCH_INDEX = /\bIndex Scan on message_search\b/v;
const SCANS_MESSAGES = /\bSeq Scan on messages\b/v;

function postAndSearch(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.gen(function* everything() {
    yield* storage.createChannel(channelFixture("grill"));
    yield* Effect.forEach(
      ["Time to deploy", "The deployment failed", "Meet at the café"],
      (text) => appendTo(storage)(newMessageFixture("grill", text)),
      ONE_AT_A_TIME,
    );
    const { words } = parseQuery("deplo failed");
    yield* storage.searchMessages({ authors: [], channels: [], words }, EVERY);
    yield* storage.searchMessages(
      { authors: [identityName("agent")], channels: [channelName("grill")], words },
      { after: { createdAt: isoTime("2026-01-05T00:00:00.000Z"), id: messageId(SECOND) }, limit: 1 },
    );
  });
}

function matchesWords({ sql }: QueryPlan): boolean {
  return Str.includes(MATCHES_WORDS)(sql);
}

function usesTheSearchIndex({ plan }: QueryPlan): boolean {
  return Arr.some(plan, (line) => SEARCH_INDEX.test(line)) && !Arr.some(plan, (line) => SCANS_MESSAGES.test(line));
}

it.effect("on Postgres, every search for words finds them through the message_search index", () =>
  Effect.gen(function* plans() {
    const planned = yield* freshPostgresQueryPlans(postAndSearch);
    const searches = Arr.filter(planned, matchesWords);

    expect(searches.length).toBeGreaterThan(NONE);
    expect(Arr.filter(searches, (search) => !usesTheSearchIndex(search))).toStrictEqual([]);
  }),
);
