import { adminClient, agentOption, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { Message } from "../../sdk/index.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const CHANNEL = "web-posters-channel";
const THREAD_CHANNEL = "web-posters-thread";

async function suggested(): Promise<readonly (string | null)[]> {
  const list = await screen.findByRole("listbox", { name: "Mention suggestions" });
  const shown: (string | null)[] = [];
  for (const option of within(list).getAllByRole("option")) {
    shown.push(option.textContent);
  }
  return shown;
}

async function typeIn(label: "Message" | "Reply", text: string): Promise<void> {
  const box = await screen.findByLabelText(label, { selector: "textarea" });
  fireEvent.change(box, { target: { value: text } });
}

async function channelWithPosters(channel: string): Promise<Message> {
  const ada = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const bea = await newIdentity({ kind: "human", name: `${channel}-bea` });
  const cy = await newIdentity({ kind: "agent", name: `${channel}-cy` });
  await newIdentity({ kind: "human", name: `${channel}-dot` });
  await adminClient().createChannel({ name: channel });
  const { message } = await ada.client.createMessage({ channel, text: "First" });
  await bea.client.createMessage({ channel, text: "Second" });
  await cy.client.createMessage({ channel, replyTo: message.id, text: "A reply" });
  return message;
}

async function threadWithMembers(): Promise<Message> {
  await channelWithPosters(THREAD_CHANNEL);
  const eve = await newIdentity({ kind: "human", name: `${THREAD_CHANNEL}-eve` });
  const { message } = await eve.client.createMessage({ channel: THREAD_CHANNEL, text: "Eve's thread" });
  const fay = await newIdentity({ kind: "human", name: `${THREAD_CHANNEL}-fay` });
  await fay.client.createMessage({ channel: THREAD_CHANNEL, replyTo: message.id, text: "Fay replies" });
  return message;
}

it("in a channel's box, the channel's posters are suggested first, most recent poster first, then the rest by name", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await channelWithPosters(CHANNEL);
  const close = openAt({ client: adminClient(), hash: `#/channels/${CHANNEL}` });
  await inPane().findByText("Second");
  await typeIn("Message", `Ping @${CHANNEL}`);
  const everyone = await suggested();
  await typeIn("Message", `Ping @${CHANNEL}-d`);

  await expect(suggested()).resolves.toStrictEqual([`@${CHANNEL}-dot`]);
  expect(everyone).toStrictEqual([
    agentOption(`${CHANNEL}-cy`),
    `@${CHANNEL}-bea`,
    `@${CHANNEL}-ada`,
    `@${CHANNEL}-dot`,
  ]);

  close();
});

it("in a thread's box, its members come first, then the channel's other posters, then the rest by name", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const parent = await threadWithMembers();
  const close = openAt({ client: adminClient(), hash: `#/channels/${THREAD_CHANNEL}/threads/${String(parent.id)}` });
  await inPane().findByText("Second");
  await typeIn("Reply", `Ping @${THREAD_CHANNEL}`);

  await expect(suggested()).resolves.toStrictEqual([
    `@${THREAD_CHANNEL}-fay`,
    `@${THREAD_CHANNEL}-eve`,
    agentOption(`${THREAD_CHANNEL}-cy`),
    `@${THREAD_CHANNEL}-bea`,
    `@${THREAD_CHANNEL}-ada`,
    `@${THREAD_CHANNEL}-dot`,
  ]);

  close();
});
