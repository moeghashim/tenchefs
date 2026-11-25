import { adminClient, anonymousClient, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Unread } from "../../unread/index.ts";
import { boardStoreFor } from "./defaults.ts";
import { createUnread } from "../../unread/index.ts";
import { inConversation } from "./regions.ts";
import { openBoard } from "./render.tsx";
import { openWithClockStopped } from "./clock.ts";
import { subscribedReader } from "./inbox-reader.ts";
import { waitFor } from "@testing-library/react";

interface NewsChannel {
  readonly channel: string;
  readonly reader: CookoutClient;
  readonly unread: Unread;
}

async function loadedNews(channel: string): Promise<NewsChannel> {
  const { poster, reader } = await subscribedReader(channel);
  await poster.createMessage({ channel, text: "Old post" });
  await poster.createMessage({ channel, text: "New post" });
  const unread = createUnread({ boardStore: boardStoreFor({ client: reader }) });
  const statuses: string[] = [];
  unread.subscribe(() => {
    statuses.push(unread.snapshot().status);
  });
  await waitFor(() => {
    expect(statuses).toContain("loaded");
  });
  return { channel, reader, unread };
}

function opened(news: NewsChannel, board: CookoutClient): () => void {
  return openBoard({
    boardStore: boardStoreFor({ client: board }),
    hash: `#/inbox/${news.channel}`,
    session: sessionOf(news.reader),
    unread: news.unread,
  });
}

it("a channel conversation whose message before can't be read says why", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const news = await loadedNews("web-channel-refused");
  const unmount = opened(news, anonymousClient());
  const alert = await inConversation().findByRole("alert");

  expect(alert.textContent).toMatch(/^Couldn't load the conversation \(\w+\): /u);

  unmount();
});

it("a channel deleted after the inbox loaded says there is nothing there", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const news = await loadedNews("web-channel-refused-gone");
  await adminClient().deleteChannel(news.channel);
  const unmount = opened(news, news.reader);
  const nothing = await inConversation().findByText("Nothing here");
  const open = inConversation().getByRole("link", { name: `Open in #${news.channel}` });

  expect([nothing.textContent, open.tagName]).toStrictEqual(["Nothing here", "A"]);

  unmount();
});

it("a channel conversation for someone whose inbox can't be read says there is nothing there", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const unmount = openWithClockStopped({
    client: anonymousClient(),
    hash: "#/inbox/general",
    session: sessionOf(adminClient()),
  });
  const nothing = await inConversation().findByText("Nothing here");

  expect(nothing.textContent).toBe("Nothing here");

  unmount();
});
