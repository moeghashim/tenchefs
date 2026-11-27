import type { ClockFixtures, ClockOptions, OwnCookout } from "./clock.ts";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { createTestAgent, testAgentDisplayName, testClient } from "../../../testing/index.ts";
import { inDialog, inPane, inSidebar } from "./regions.ts";
import { shown, walk } from "./key-walk.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Step } from "./key-walk.ts";
import { clockFixtures } from "./clock.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures).extend<ClockFixtures & ClockOptions>(clockFixtures);

const NUDGED_AFTER = 3;
const OFFERED_AFTER = 30;
const DEACTIVATED_AFTER = 60;
const NUDGE = "Quiet for 3 days";

interface Asking {
  readonly client: CookoutClient;
  readonly ownCookout: OwnCookout;
}

interface Item {
  readonly page: Page;
  readonly says: string;
}

function markAll(page: Page): Locator {
  return inPane(page).getByRole("button", { exact: true, name: "Mark all as read" });
}

function forYou(page: Page): Locator {
  return inPane(page).getByRole("list", { exact: true, name: "For you" });
}

function notice({ page, says }: Item): Locator {
  return forYou(page).getByRole("listitem").filter({ hasText: says });
}

function nudge({ page, says }: Item): Locator {
  return notice({ page, says: NUDGE }).filter({ hasText: says });
}

function button(item: Locator, name: string): Locator {
  return item.getByRole("button", { exact: true, name });
}

function signedIn(page: Page, lands: Locator): readonly Step[] {
  return [
    shown(lands),
    ["Tab", inSidebar(page).getByRole("button", { exact: true, name: "Collapse sidebar" })],
    ["Control+]", lands],
  ];
}

async function joinsAsked({ client, ownCookout }: Asking, names: readonly string[]): Promise<void> {
  const [name, ...rest] = names;
  if (typeof name !== "string") {
    return;
  }
  await createTestAgent({ by: client, name });
  await testClient({ env: {}, url: ownCookout.webUrl }).startAgentJoin({ as: name, host: "build-box" });
  await joinsAsked({ client, ownCookout }, rest);
}

async function agentsMade(client: CookoutClient, names: readonly string[]): Promise<void> {
  const [name, ...rest] = names;
  if (typeof name !== "string") {
    return;
  }
  await createTestAgent({ by: client, name });
  await agentsMade(client, rest);
}

async function nudged(ownCookout: OwnCookout, reader: string): Promise<string> {
  const channel = `${reader}-room`;
  const { client, token } = await ownCookout.newIdentity({ kind: "human", name: reader });
  await ownCookout.admin.createChannel({ name: channel });
  await client.subscribe(channel);
  await client.createMessage({ channel, text: "First topic." });
  await client.createMessage({ channel, text: "Second topic." });
  await ownCookout.daysPass(NUDGED_AFTER);
  await joinsAsked({ client, ownCookout }, [`${reader}-approved`, `${reader}-dismissed`]);
  return token;
}

test("join requests and nudges are answered by keys alone, focus moving to the next notice", async ({
  ownCookout,
  page,
}) => {
  const reader = unique("kbwalk-notices");
  await logInWithStream({ page, token: await nudged(ownCookout, reader), url: "/#/inbox" });
  const later = nudge({ page, says: "Second topic." });
  const earlier = nudge({ page, says: "First topic." });
  const approved = notice({ page, says: testAgentDisplayName(`${reader}-approved`) });
  const dismissed = notice({ page, says: testAgentDisplayName(`${reader}-dismissed`) });
  await walk({
    page,
    steps: [
      ...signedIn(page, later.getByRole("link").first()),
      ["Shift+Tab", button(dismissed, "Dismiss")],
      ["Shift+Tab", button(dismissed, "Approve")],
      ["Shift+Tab", dismissed.getByRole("link", { exact: true, name: testAgentDisplayName(`${reader}-dismissed`) })],
      ["Shift+Tab", button(approved, "Dismiss")],
      ["Enter", button(dismissed, "Approve")],
      ["Enter", button(later, "Close")],
      ["Enter", button(earlier, "Close")],
      ["Tab", button(earlier, "Mark read")],
      ["Enter", markAll(page)],
    ],
  });

  await expect(forYou(page)).toBeHidden();
});

async function offered(ownCookout: OwnCookout, reader: string): Promise<string> {
  const { client, token } = await ownCookout.newIdentity({ kind: "human", name: reader });
  await agentsMade(client, [`${reader}-reactivated`, `${reader}-left`]);
  await ownCookout.daysPass(DEACTIVATED_AFTER);
  await agentsMade(client, [`${reader}-kept`, `${reader}-deactivated`]);
  await ownCookout.daysPass(OFFERED_AFTER);
  return token;
}

function agentRow(page: Page, name: string): Locator {
  return notice({ page, says: testAgentDisplayName(name) });
}

function answered(page: Page, reader: string): readonly Step[] {
  const left = agentRow(page, `${reader}-left`);
  const reactivated = agentRow(page, `${reader}-reactivated`);
  const deactivated = agentRow(page, `${reader}-deactivated`);
  const kept = agentRow(page, `${reader}-kept`);
  const confirm = inDialog(page);
  const cancel = button(confirm, "Cancel");
  return [
    ["Tab", left.getByRole("link", { exact: true, name: testAgentDisplayName(`${reader}-left`) })],
    ["Tab", button(left, "Reactivate")],
    ["Tab", button(left, "Mark read")],
    ["Enter", button(reactivated, "Reactivate")],
    ["Enter", cancel],
    ["Tab", button(confirm, `Reactivate @${reader}-reactivated`)],
    ["Enter", button(reactivated, "Copy token")],
    ["Tab", button(reactivated, "Done")],
    ["Enter", button(deactivated, "Deactivate")],
    ["Enter", cancel],
    ["Escape", button(deactivated, "Deactivate")],
    ["Enter", cancel],
    ["Tab", button(confirm, `Deactivate @${reader}-deactivated`)],
    ["Enter", button(kept, "Deactivate")],
    ["Tab", button(kept, "Keep")],
  ];
}

test("deactivation offers and deactivated agents are answered by keys alone", async ({ ownCookout, page }) => {
  const reader = unique("kbwalk-offers");
  await logInWithStream({ page, token: await offered(ownCookout, reader), url: "/#/inbox" });
  await walk({ page, steps: [...signedIn(page, markAll(page)), ...answered(page, reader), ["Enter", markAll(page)]] });

  await expect(forYou(page)).toBeHidden();
});

function inboxLink(page: Page): Locator {
  return page
    .getByRole("navigation", { exact: true, includeHidden: true, name: "Sidebar" })
    .getByRole("link", { includeHidden: true })
    .filter({ hasText: "for you" });
}

async function deactivateHeld(page: Page): Promise<() => void> {
  const answer = Promise.withResolvers<null>();
  await page.route("**/v1/identities/*/deactivate", async (route) => {
    const response = await route.fetch();
    await answer.promise;
    await route.fulfill({ response });
  });
  return () => {
    answer.resolve(null);
  };
}

async function confirmedBeforeTheAnswer(page: Page, reader: string): Promise<void> {
  const counted = await inboxLink(page).textContent();
  const release = await deactivateHeld(page);
  await button(agentRow(page, `${reader}-deactivated`), "Deactivate").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(inboxLink(page)).not.toHaveText(counted ?? "");

  release();
}

test("confirming Deactivate on an offer whose row goes before the answer puts focus on the next offer's Deactivate", async ({
  ownCookout,
  page,
}) => {
  const reader = unique("kbwalk-offer-first");
  await logInWithStream({ page, token: await offered(ownCookout, reader), url: "/#/inbox" });
  await confirmedBeforeTheAnswer(page, reader);

  await expect(button(agentRow(page, `${reader}-kept`), "Deactivate")).toBeFocused();
});
