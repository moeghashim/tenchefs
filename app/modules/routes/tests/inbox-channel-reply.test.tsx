import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import type { OpenedView } from "./view-opened.ts";
import { chose } from "./menus.ts";
import { conversationOpened } from "./view-opened.ts";
import { inConversation } from "./regions.ts";

interface TwoPosts {
  readonly channel: string;
  readonly reader: CookoutClient;
  readonly older: MessageId;
  readonly newest: MessageId;
}

async function twoPostsBy(channel: string): Promise<TwoPosts> {
  await adminClient().createChannel({ name: channel });
  const ada = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const bob = await newIdentity({ kind: "agent", name: `${channel}-bob` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  const { message: older } = await ada.client.createMessage({ channel, text: "Deploy at noon?" });
  const { message: newest } = await bob.client.createMessage({ channel, text: "Build is green" });
  return { channel, newest: newest.id, older: older.id, reader: reader.client };
}

interface Sending {
  readonly answered: OpenedView["answered"];
  readonly label: string;
  readonly text: string;
}

async function sent({ answered, label, text }: Sending): Promise<HTMLElement> {
  const box = await inConversation().findByRole("textbox", { name: label });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.click(await inConversation().findEnabledButton("Send"));
  await Promise.all([answered("createMessage"), answered("getThread")]);
  return box;
}

async function repliesIn(reader: CookoutClient, post: MessageId): Promise<readonly string[]> {
  const { replies } = await reader.getThread(post);
  return replies.map((reply) => reply.text);
}

async function messageSaying(text: string): Promise<HTMLElement> {
  const shown = await inConversation().findByText(text);
  const article = shown.closest("article");
  if (article === null) {
    throw new TypeError(`No message saying ${text}`);
  }
  return article;
}

function textsIn(label: string): readonly string[] {
  const texts: string[] = [];
  for (const article of within(inConversation().getByRole("feed", { name: label })).getAllByRole("article")) {
    texts.push(article.textContent);
  }
  return texts;
}

it("in a channel conversation, the box replies to the newest post's author, and the reply shows under that post", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posts = await twoPostsBy("web-inbox-channel-reply");
  const { answered, close: unmount } = await conversationOpened({
    client: posts.reader,
    hash: `#/inbox/${posts.channel}`,
    waitingOn: ["listMessages", "getThread"],
  });
  const box = await sent({ answered, label: "Reply to @web-inbox-channel-reply-bob", text: "Nice" });
  await inConversation().findByRole("feed", { name: "Replies to the post" });
  await waitFor(() => {
    expect(box).toHaveProperty("value", "");
  });

  expect([
    await repliesIn(posts.reader, posts.newest),
    textsIn("Replies to the post").map((text) => text.endsWith("Nice")),
    globalThis.location.hash,
  ]).toStrictEqual([["Nice"], [true], `#/inbox/${posts.channel}`]);

  unmount();
});

it("reply on an older post in a channel conversation retargets the box to that post's thread", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posts = await twoPostsBy("web-inbox-channel-retarget");
  const { answered, close: unmount } = await conversationOpened({
    client: posts.reader,
    hash: `#/inbox/${posts.channel}`,
    waitingOn: ["listMessages", "getThread"],
  });
  fireEvent.contextMenu(await messageSaying("Deploy at noon?"));
  await chose("Reply");
  await answered("getThread");
  const box = await sent({ answered, label: "Reply to @web-inbox-channel-retarget-ada", text: "Noon works" });
  await within(await inConversation().findByRole("feed", { name: "Replies to the post" })).findByText("Noon works");

  expect([
    await repliesIn(posts.reader, posts.older),
    await repliesIn(posts.reader, posts.newest),
    box.ownerDocument.activeElement,
  ]).toStrictEqual([["Noon works"], [], box]);

  unmount();
});
