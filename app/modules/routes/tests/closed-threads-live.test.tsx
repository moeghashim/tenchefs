import type { CookoutEvent, EventStream, MessageId } from "../../sdk/index.ts";
import { expect, it, vi } from "vitest";
import { feedOf, idOf, postedIn } from "./feed.ts";
import type { ClientMethod } from "./view-opened.ts";
import type { Posted } from "./feed.ts";
import { inThread } from "./regions.ts";
import { viewOpened } from "./view-opened.ts";
import { watched } from "./watched.ts";

const TEXTS = ["Before.", "Deploy?", "After."] as const;
const FOLDED = ["Before.", "<1 closed thread>", "After."] as const;
const UNFOLDED = ["Before.", "Deploy?", "After."] as const;

interface LiveOpening {
  readonly hash: string;
  readonly posted: Posted;
  readonly waitingOn: readonly ClientMethod[];
}

interface OpenedLive {
  readonly close: () => Promise<void>;
  readonly threadHeard: (closed: boolean) => Promise<void>;
}

async function feedShows(shown: readonly string[]): Promise<void> {
  await vi.waitFor(async () => {
    await expect(feedOf(TEXTS)).resolves.toStrictEqual(shown);
  });
}

function deployOf(posted: Posted): MessageId {
  return idOf({ posted, text: "Deploy?" });
}

function isThread(parent: MessageId, closed: boolean): (event: CookoutEvent) => boolean {
  return (event) => event.type === "thread" && event.parent.id === parent && "closedAt" in event.parent === closed;
}

async function openLive({ hash, posted, waitingOn }: LiveOpening): Promise<OpenedLive> {
  const { heard, live, stream } = watched(posted.reader);
  const { close } = await viewOpened({ client: posted.reader, hash, live, waitingOn });
  const events: EventStream = await stream;
  await feedShows(UNFOLDED);
  return {
    close: async () => {
      close();
      await events.close();
    },
    threadHeard: async (closed) => {
      await heard(isThread(deployOf(posted), closed));
    },
  };
}

async function closedLive(posted: Posted, threadHeard: OpenedLive["threadHeard"]): Promise<void> {
  await posted.poster.closeThread(deployOf(posted));
  await threadHeard(true);
  await feedShows(FOLDED);
  await inThread().findByRole("button", { name: "Reopen thread" });
}

async function repliedLive(posted: Posted, threadHeard: OpenedLive["threadHeard"]): Promise<void> {
  await posted.poster.createMessage({ channel: posted.channel, replyTo: deployOf(posted), text: "Still broken." });
  await threadHeard(false);
}

it("a close by another identity folds the thread live, and a reopen unfolds it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-close-live", closed: [], texts: TEXTS });
  const { close, threadHeard } = await openLive({
    hash: `#/channels/${posted.channel}`,
    posted,
    waitingOn: ["listMessages"],
  });
  await posted.poster.closeThread(deployOf(posted));
  await threadHeard(true);

  await feedShows(FOLDED);

  await posted.poster.reopenThread(deployOf(posted));
  await threadHeard(false);

  await feedShows(UNFOLDED);

  await close();
});

it("a reply by another identity unfolds a closed thread live, and its bar goes", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-close-live-reply", closed: [], texts: TEXTS });
  const parent = deployOf(posted);
  const { close, threadHeard } = await openLive({
    hash: `#/channels/${posted.channel}/threads/${String(parent)}`,
    posted,
    waitingOn: ["listMessages", "getThread"],
  });
  await closedLive(posted, threadHeard);
  await repliedLive(posted, threadHeard);

  await feedShows(UNFOLDED);
  await inThread().findByRole("button", { name: "Close thread" });

  expect(inThread().queryByRole("button", { name: "Reopen thread" })).toBeNull();

  await close();
});
