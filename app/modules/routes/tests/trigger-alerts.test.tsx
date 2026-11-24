import { adminClient, newIdentity } from "./identities.ts";
import { authorDot, openedBy } from "./presence.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import { inPane, inProfile, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const REFUSED_URL = "http://routines.example.com/fire";
const TOKEN = "routine-secret";
const UNREACHABLE = "Unreachable: HTTP 404, just now";

interface Called {
  readonly owner: CookoutClient;
  readonly bot: string;
  readonly channel: string;
  readonly mention: () => Promise<number>;
}

function failingUrl(): string {
  return `${webTestCookout().url}/v1/no-such-route`;
}

async function untilCalled({ bot, owner }: Called, ok: boolean): Promise<void> {
  await waitFor(async () => {
    await expect(owner.getTrigger(bot)).resolves.toHaveProperty("trigger.lastResult.ok", ok);
  });
}

function mentionIn(channel: string, bot: string): () => Promise<number> {
  return async () => {
    const { message } = await adminClient().createMessage({ channel, text: `@${bot} wake up` });
    return message.id;
  };
}

async function channelWithPostBy(agent: CookoutClient, channel: string): Promise<void> {
  await adminClient().createChannel({ name: channel });
  await agent.createMessage({ channel, text: "Listening for mentions." });
}

async function calledAgent(prefix: string): Promise<Called> {
  const owner = await newIdentity({ kind: "human", name: `${prefix}-owner` });
  const bot = `${prefix}-bot`;
  const agent = await newIdentity({ kind: "agent", name: bot, owner: `${prefix}-owner` });
  await owner.client.setTrigger(bot, { token: TOKEN, url: webTestCookout().receiverUrl });
  await channelWithPostBy(agent.client, prefix);
  const called: Called = { bot, channel: prefix, mention: mentionIn(prefix, bot), owner: owner.client };
  await called.mention();
  await untilCalled(called, true);
  await openedBy({ client: owner.client, hash: `#/people/${bot}` });
  return called;
}

async function failedOnce(called: Called): Promise<number> {
  await called.owner.setTrigger(called.bot, { token: TOKEN, url: failingUrl() });
  const failed = await called.mention();
  await untilCalled(called, false);
  return failed;
}

function filledTrigger(name: string): HTMLElement {
  const form = inProfile().getByRole("form", { name });
  fireEvent.change(within(form).getByLabelText("Trigger URL", { exact: false }), {
    target: { value: REFUSED_URL },
  });
  fireEvent.change(within(form).getByLabelText("Token (write-only: never shown again)"), {
    target: { value: TOKEN },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Save trigger URL" }));
  return form;
}

it("the profile shows the last call's answer, and a failed one turns the dot red", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const called = await calledAgent("web-trigger-red");
  await inProfile().findByText("Last call answered HTTP 200, just now");
  await failedOnce(called);

  await expect(inProfile().findByText(UNREACHABLE)).resolves.toBeDefined();

  globalThis.location.hash = `#/channels/${called.channel}`;

  await expect(
    authorDot({ at: "Listening for mentions.", label: "Unreachable", tooltip: UNREACHABLE, who: called.bot }),
  ).resolves.toStrictEqual({ presence: "unreachable", tooltip: UNREACHABLE });
});

it("a failed call raises an inbox alert for the owner, which says when the agent is reached again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const called = await calledAgent("web-trigger-alert");
  const failed = await failedOnce(called);
  fireEvent.click(inSidebar().getByRole("link", { name: /^Inbox/u }));
  const alert = `@${called.bot} is unreachable: its trigger URL answered HTTP 404 to message ${String(failed)}`;

  await expect(inPane().findByText(alert)).resolves.toBeDefined();
  await expect(inPane().findByText("just now · Still unreachable")).resolves.toBeDefined();

  await called.owner.setTrigger(called.bot, { token: TOKEN, url: webTestCookout().receiverUrl });

  await expect(inPane().findByText(/Reached again/u)).resolves.toBeDefined();
});

it("a trigger URL the server refuses shows the refusal in the form and keeps the URL", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-trigger-refused-owner" });
  await newIdentity({ kind: "agent", name: "web-trigger-refused-bot", owner: "web-trigger-refused-owner" });
  await openedBy({ client: owner.client, hash: "#/people/web-trigger-refused-bot" });
  await inProfile().findByText("No trigger URL: a mention calls nothing.");
  const form = filledTrigger("Trigger URL for @web-trigger-refused-bot");

  await expect(
    within(form).findByText(/^Couldn't save the trigger URL \(trigger_url_invalid\)/u),
  ).resolves.toBeDefined();
  expect(within(form).getByLabelText<HTMLInputElement>("Trigger URL", { exact: false }).value).toBe(REFUSED_URL);
});
