import { test as base, expect } from "@playwright/test";
import { createTestAgent, testAgentDisplayName } from "../../../testing/index.ts";
import { inPane, sidebarLink } from "./regions.ts";
import type { Page } from "@playwright/test";
import { adminClient } from "./people.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

interface Mentioning {
  readonly reviewers: string;
  readonly token: string;
}

async function threadIn(channel: string): Promise<void> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  await admin.createMessage({ channel, text: "Who can review this?" });
}

async function openThread(page: Page, token: string, channel: string): Promise<void> {
  await logIn({ page, token });
  await sidebarLink({ label: `#${channel}`, page }).click();
  await page.getByRole("article").hover();
  await inPane(page).getByRole("button", { exact: true, name: "More actions" }).click();
  await page.getByRole("menuitem", { exact: true, name: "Reply" }).click();
}

async function mentionerAndReviewers(): Promise<Mentioning> {
  const admin = adminClient();
  const reviewers = unique("browser-reviewer");
  const { token } = await admin.createIdentity({ kind: "human", name: unique("browser-mentioner") });
  await createTestAgent({ by: admin, name: `${reviewers}-bot` });
  await admin.createIdentity({ kind: "human", name: `${reviewers}-ada` });
  await threadIn(unique("browser-composer"));
  return { reviewers, token };
}

test("typing @ and a prefix in the reply box suggests the matching identities, and choosing one inserts the mention", async ({
  page,
}) => {
  const { reviewers, token } = await mentionerAndReviewers();

  await openThread(page, token, unique("browser-composer"));
  const box = page.getByRole("textbox", { exact: true, name: "Reply" });
  await box.pressSequentially(`Could @${reviewers}`);
  const suggestions = page.getByRole("listbox", { exact: true, name: "Mention suggestions" });

  await expect(suggestions.getByRole("option")).toHaveText([
    `@${reviewers}-ada`,
    `@${reviewers}-bot${testAgentDisplayName(`${reviewers}-bot`)}`,
  ]);

  await suggestions
    .getByRole("option", {
      exact: true,
      name: `${testAgentDisplayName(`${reviewers}-bot`)}, @${reviewers}-bot, Offline`,
    })
    .click();
  await page.keyboard.type("look?");

  await expect(box).toHaveValue(`Could @${reviewers}-bot look?`);
  await expect(suggestions).toBeHidden();
});
