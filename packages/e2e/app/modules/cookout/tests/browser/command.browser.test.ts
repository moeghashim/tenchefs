import { test as base, expect } from "@playwright/test";
import { browserFixtures, exampleWebhookCommand, shownMessage } from "../../server.ts";
import { createCookoutClient } from "@ai-hero/cookout/sdk";

const INDENT = 2;
const REPLY_WITHIN = 20_000;

function pretty(value: unknown): string {
  return JSON.stringify(value, null, INDENT);
}

const test = base.extend(browserFixtures);

test("a person sees a call to the example Webhook command and the handler's result reply with its data in the thread", async ({
  cookout,
  page,
}) => {
  await cookout.requireExampleCommand();
  const { channel } = await cookout.createChannel("calls");
  const { identity, token } = await cookout.createHuman("person");
  const person = createCookoutClient({ token, url: cookout.url });
  const { threadId } = await person.callCommand(exampleWebhookCommand, {
    channel: channel.name,
    data: { branch: "main" },
  });
  await cookout.logIn(token);
  await page.goto(`${cookout.url}/#/channels/${channel.name}/threads/${String(threadId)}`);

  await expect(page.getByRole("article", { name: "Parent message" })).toContainText(identity.name);
  await expect(
    page.getByRole("article", { name: "Parent message" }).getByLabel(`Call to /${exampleWebhookCommand}`),
  ).toHaveText(JSON.stringify({ branch: "main" }));
  await expect(page.getByRole("feed", { name: "Replies" }).getByRole("article")).toHaveText(
    [
      shownMessage({
        body: `/${exampleWebhookCommand} is done.▸ data▾ data${pretty({ received: { branch: "main" } })}`,
        header: `${exampleWebhookCommand}agent`,
      }),
    ],
    { timeout: REPLY_WITHIN },
  );
});
