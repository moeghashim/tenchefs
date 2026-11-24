import { Array as Arr, Effect, Fiber, Option, Schedule, String as Str } from "effect";
import type { CookoutClient, InboxHistoryResponse, InboxResponse, OfflineAlert } from "@ai-hero/cookout/sdk";
import { CookoutUnderTest, cookoutUnderTest, openRelay } from "../../server.ts";
import type { CookoutUnderTestService, Session, SessionNeeds } from "../../server.ts";
import { expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";

const CONNECTED = "event: connected";
const NONE = 0;
const POLL = Schedule.spaced("200 millis");

type Entries = Pick<InboxResponse, "alerts" | "deactivatedQuietAgents" | "deactivationOffers" | "items" | "nudges">;

function namesIn(entries: Entries): readonly string[] {
  return [
    ...Arr.map(entries.items, ({ channel }) => channel.name),
    ...Arr.map(entries.nudges, ({ channel }) => channel.name),
    ...Arr.map(entries.alerts, ({ agent }) => agent),
    ...Arr.map(entries.deactivationOffers, ({ identity }) => identity.name),
    ...Arr.map(entries.deactivatedQuietAgents, ({ identity }) => identity.name),
  ];
}

function theRunsIn(prefix: string, entries: readonly Entries[]): readonly string[] {
  return Arr.filter(Arr.flatMap(entries, namesIn), Str.startsWith(`${prefix}-`));
}

function inboxAndHistory(client: CookoutClient): Effect.Effect<readonly [InboxResponse, InboxHistoryResponse]> {
  return Effect.all([Effect.promise(() => client.inbox()), Effect.promise(() => client.inboxHistory())], {
    concurrency: 1,
  });
}

function ownersAlerts({ owner }: CookoutUnderTestService): Effect.Effect<readonly OfflineAlert[]> {
  return Effect.gen(function* readOwnersInbox() {
    const client = yield* owner;
    const inbox = yield* Effect.promise(() => client.inbox()).pipe(
      Effect.repeat({ schedule: POLL, until: ({ alerts }) => alerts.length > NONE }),
      Effect.timeoutOption("10 seconds"),
    );
    return Option.match(inbox, { onNone: () => [], onSome: ({ alerts }) => alerts });
  });
}

interface Watching {
  readonly channel: string;
  readonly first: Session;
  readonly second: Session;
  readonly stop: Effect.Effect<unknown>;
}

const secondWatching: Effect.Effect<Watching, never, CookoutUnderTest | SessionNeeds> = Effect.gen(
  function* startWatching() {
    const cookout = yield* CookoutUnderTest;
    const { channel } = yield* cookout.createChannel("room");
    const first = yield* cookout.joinAgent("agent-1");
    const relay = yield* openRelay(cookout.url);
    const second = yield* cookout.joinAgent("watcher", relay.url);
    const watch = yield* Effect.forkScoped(second.cookout("watch"));
    yield* relay.relayed(CONNECTED);
    const stop = cookout
      .deactivateIdentity(second.name)
      .pipe(Effect.andThen(relay.cut), Effect.andThen(Fiber.join(watch)));
    return { channel: channel.name, first, second, stop };
  },
);

const talkedThenStopped: Effect.Effect<string, never, CookoutUnderTest | SessionNeeds> = Effect.gen(
  function* talkThenStop() {
    const { channel, first, second, stop } = yield* secondWatching;
    const top = yield* first.post(channel, `Can you look at this, @${second.name}?`);
    yield* second.post(channel, "On it.", "--reply-to", String(top));
    yield* first.post(channel, "Anyone else around?");
    yield* stop;
    return second.name;
  },
);

it.live(
  "a run's channels, posts and agents leave nothing in the Inbox of the admin it runs as, an identity it didn't create",
  () =>
    Effect.gen(function* talkThenLook() {
      const cookout = yield* CookoutUnderTest;
      const watcher = yield* talkedThenStopped;
      const alerts = yield* ownersAlerts(cookout);
      const admins = yield* inboxAndHistory(cookout.admin);

      expect({ admins: theRunsIn(cookout.prefix, admins), alerts }).toMatchObject({
        admins: [],
        alerts: [{ agent: watcher, offlineReason: "deactivated" }],
      });
    }).pipe(Effect.provide([cookoutUnderTest, NodeServices.layer])),
);
