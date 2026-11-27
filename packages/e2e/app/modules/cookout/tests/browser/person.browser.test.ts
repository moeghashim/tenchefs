import type { CookoutClient, IdentityWithTokenResponse, Message } from "@ai-hero/cookout/sdk";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { browserFixtures, shownMessage } from "../../server.ts";
import type { BrowserRun } from "../../server.ts";
import { createCookoutClient } from "@ai-hero/cookout/sdk";

interface Member {
  readonly name: string;
  readonly client: CookoutClient;
  readonly token: string;
}

interface Board {
  readonly channel: string;
  readonly person: Member;
  readonly agent: Member;
  readonly question: Message;
}

function memberOf(cookout: BrowserRun, { identity, token }: IdentityWithTokenResponse): Member {
  return { client: createCookoutClient({ token, url: cookout.url }), name: identity.name, token };
}

async function boardWithAMention(cookout: BrowserRun): Promise<Board> {
  const { channel } = await cookout.createChannel("room");
  const person = memberOf(cookout, await cookout.createHuman("person"));
  const agent = memberOf(cookout, await cookout.createAgent("agent"));
  await person.client.subscribe(channel.name);
  const text = `Can you review the deploy, @${person.name}?`;
  const { message: question } = await agent.client.createMessage({ channel: channel.name, text });
  return { agent, channel: channel.name, person, question };
}

function channelRow(page: Page, channel: string): Locator {
  return page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("link", { name: new RegExp(`^#${channel}(?![a-z0-9-])`, "u") });
}

async function openQuestion(page: Page, row: Locator): Promise<void> {
  await row.click();
  const question = page
    .getByRole("feed", { name: "Messages" })
    .getByRole("article")
    .filter({ hasText: /Can you review the deploy/u });
  await question.hover();
  await question.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
}

async function leaveForTheInbox(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("link", { name: /^Inbox/u })
    .click();
}

async function replyMentioning(page: Page, cookout: BrowserRun, { agent, channel }: Board): Promise<void> {
  await openQuestion(page, channelRow(page, channel));
  const reply = page.getByRole("textbox", { exact: true, name: "Reply" });

  await expect(reply).toHaveValue(`@${agent.name} `);

  await reply.fill("");
  await reply.pressSequentially(`Over to @${cookout.prefix}-ag`);
  const suggestions = page.getByRole("listbox", { name: "Mention suggestions" });

  await expect(suggestions.getByRole("option")).toHaveText([`@${agent.name}`]);

  await suggestions.getByRole("option", { name: `@${agent.name}` }).click();
  await page.keyboard.type("for the review.");
  await page.getByRole("form", { name: "Reply to the thread" }).getByRole("button", { name: "Send" }).click();
}

function inboxOf(member: Member): () => Promise<readonly string[]> {
  return async () => {
    const { items } = await member.client.inbox();
    return items.map((item) => item.message.text);
  };
}

async function readTheMention(page: Page, cookout: BrowserRun, { channel, person }: Board): Promise<void> {
  const row = channelRow(page, channel);
  await cookout.logIn(person.token);

  await expect(row).toHaveAccessibleName(`#${channel} 1 for you`);

  await openQuestion(page, row);

  await expect.poll(inboxOf(person)).toStrictEqual([]);

  await leaveForTheInbox(page);
}

async function agentAnswers({ agent, channel, question }: Board, mentionReply: string): Promise<void> {
  await expect.poll(inboxOf(agent)).toStrictEqual([mentionReply]);

  const { replies } = await agent.client.getThread(question.id);
  const seen = Math.max(question.id, ...replies.map((reply) => reply.id));
  await agent.client.createMessage({ channel, replyTo: question.id, seen, text: "Looking now." });
}

const test = base.extend(browserFixtures);

test("a person logs in, opens a mention's thread, replies with a picked @-mention and sees unread counts and the agent's reply change live", async ({
  cookout,
  page,
}) => {
  const board = await boardWithAMention(cookout);
  const { agent, channel, person } = board;
  const row = channelRow(page, channel);
  await readTheMention(page, cookout, board);

  await expect(row).toHaveAccessibleName(`#${channel}`);

  await agent.client.createMessage({ channel, text: "Deploy starts at noon." });

  await expect(row).toHaveAccessibleName(`#${channel} 1 unread`);

  await replyMentioning(page, cookout, board);
  await agentAnswers(board, `Over to @${agent.name} for the review.`);

  await expect(page.getByRole("feed", { name: "Replies" }).getByRole("article")).toHaveText([
    shownMessage({ body: `Over to @${agent.name} for the review.`, header: person.name }),
    shownMessage({ body: "Looking now.", header: `${agent.name}agent` }),
  ]);
});
