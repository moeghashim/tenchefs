import type { CookoutClient, Message, MessageId } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { inThread } from "./regions.ts";
import { messagesIn } from "./messages.ts";
import { openWithClockStopped } from "./clock.ts";
import { slept } from "./slow-calls.ts";
import { subscribedReader } from "./inbox-reader.ts";

const READ = 3;
const NEW = 22;
const FIRST = 1;
const POSITIONS_DELAY_MS = 300;

interface Replying {
  readonly poster: CookoutClient;
  readonly parent: Message;
  readonly count: number;
  readonly from: number;
}

async function repliedUpTo(replying: Replying): Promise<MessageId> {
  const { message } = await replying.poster.createMessage({
    channel: replying.parent.channel,
    replyTo: replying.parent.id,
    text: `Reply ${String(replying.from)}`,
  });
  if (replying.count === FIRST) {
    return message.id;
  }
  const last = await repliedUpTo({ ...replying, count: replying.count - FIRST, from: replying.from + FIRST });
  return last;
}

interface NewsThread {
  readonly reader: CookoutClient;
  readonly hash: string;
}

async function threadWithNewReplies(channel: string): Promise<NewsThread> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "The long thread." });
  await reader.follow(parent.id);
  await reader.ack(await repliedUpTo({ count: READ, from: FIRST, parent, poster }));
  await repliedUpTo({ count: NEW, from: READ + FIRST, parent, poster });
  return { hash: `#/channels/${channel}/threads/${String(parent.id)}`, reader };
}

function positionsAnsweredLate(client: CookoutClient): CookoutClient {
  return {
    ...client,
    readPositions: async () => {
      await slept(POSITIONS_DELAY_MS);
      const positions = await client.readPositions();
      return positions;
    },
  };
}

it("a thread with more than 20 new replies shows every reply from the New line", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadWithNewReplies("web-earlier-from-new");
  const close = openWithClockStopped({ client: reader, hash });

  const earlier = await inThread().findByRole("button", { name: "3 earlier replies" });
  const shown = await messagesIn("Replies");

  expect([earlier.textContent, shown.length]).toStrictEqual(["3 earlier replies", NEW]);

  close();
});

it("the New line is where the reader was before the thread opened, even when the read positions answer after its ack", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { hash, reader } = await threadWithNewReplies("web-earlier-late-positions");
  const close = openWithClockStopped({ client: positionsAnsweredLate(reader), hash });

  const earlier = await inThread().findByRole("button", { name: "3 earlier replies" });
  const shown = await messagesIn("Replies");

  expect([earlier.textContent, shown.length]).toStrictEqual(["3 earlier replies", NEW]);

  close();
});
