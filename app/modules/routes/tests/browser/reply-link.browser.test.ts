import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inThread } from "./regions.ts";
import { logInToChannels } from "./login.ts";

const CHANNEL = "browser-reply-link";
const OPAQUE = /^rgb\(/u;

async function replyLink(): Promise<string> {
  const admin = adminClient();
  await admin.createChannel({ name: CHANNEL });
  const { message: parent } = await admin.createMessage({ channel: CHANNEL, text: "Deploy?" });
  const { message: reply } = await admin.createMessage({ channel: CHANNEL, replyTo: parent.id, text: "Noon works." });
  return `/#/channels/${CHANNEL}/threads/${String(parent.id)}/messages/${String(reply.id)}`;
}

test("a cold load of a reply link shows the reply highlighted once the thread's messages load", async ({ page }) => {
  const reader = await newIdentity({ kind: "human", name: CHANNEL });
  const link = await replyLink();
  await logInToChannels({ page, token: reader.token });
  await page.goto(link);
  await page.reload();
  const article = inThread(page).getByRole("article").filter({ hasText: "Noon works." });

  await expect(article).toHaveAttribute("aria-current", "true");
  await expect(article).toHaveCSS("background-color", OPAQUE);

  await page.screenshot({ path: test.info().outputPath("reply-link-highlighted.png") });

  await expect(article).toHaveAttribute("aria-current", "false");
});
