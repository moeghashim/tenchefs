import type { EventStream, MessageId } from "../../sdk/index.ts";
import { expect, it, vi } from "vitest";
import { feedOf, idOf, postedIn } from "./feed.ts";
import type { Posted } from "./feed.ts";
import { inThread } from "./regions.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

const TEXTS = ["Before.", "Deploy?", "After."] as const;
const FOLDED = ["Before.", "<1 closed thread>", "After."] as const;
const UNFOLDED = ["Before.", "Deploy?", "After."] as const;

async function feedShows(shown: readonly string[]): Promise<void> {
  await vi.waitFor(async () => {
    await expect(feedOf(TEXTS)).resolves.toStrictEqual(shown);
  });
}

async function openLive(posted: Posted, hash: string): Promise<() => Promise<void>> {
  const { live, stream } = watched(posted.reader);
  const unmount = openAt({ client: posted.reader, hash, live });
  const events: EventStream = await stream;
  await feedShows(UNFOLDED);
  return async () => {
    unmount();
    await events.close();
  };
}

function deployOf(posted: Posted): MessageId {
  return idOf({ posted, text: "Deploy?" });
}

async function closedLive(posted: Posted): Promise<void> {
  await posted.poster.closeThread(deployOf(posted));
  await feedShows(FOLDED);
  await inThread().findByRole("button", { name: "Reopen thread" });
}

it("a close by another identity folds the thread live, and a reopen unfolds it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-close-live", closed: [], texts: TEXTS });
  const close = await openLive(posted, `#/channels/${posted.channel}`);
  await posted.poster.closeThread(deployOf(posted));

  await feedShows(FOLDED);

  await posted.poster.reopenThread(deployOf(posted));

  await feedShows(UNFOLDED);

  await close();
});

it("a reply by another identity unfolds a closed thread live, and its bar goes", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-close-live-reply", closed: [], texts: TEXTS });
  const parent = deployOf(posted);
  const close = await openLive(posted, `#/channels/${posted.channel}/threads/${String(parent)}`);
  await closedLive(posted);
  await posted.poster.createMessage({ channel: posted.channel, replyTo: parent, text: "Still broken." });

  await feedShows(UNFOLDED);
  await inThread().findByRole("button", { name: "Close thread" });

  expect(inThread().queryByRole("button", { name: "Reopen thread" })).toBeNull();

  await close();
});
