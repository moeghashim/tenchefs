import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inDialog, inPane, inProfile, inSidebar, sidebarLink } from "./regions.ts";
import type { Person } from "./people.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const LIST = "Scheduled messages";

interface Owning {
  readonly owner: Person;
  readonly agent: string;
}

async function ownerOfAgent(prefix: string): Promise<Owning> {
  const name = unique(`${prefix}-owner`);
  const agent = unique(`${prefix}-bot`);
  const owner = await newIdentity({ kind: "human", name });
  await newIdentity({ kind: "agent", name: agent, owner: name });
  return { agent, owner };
}

function button(region: Locator, name: string): Locator {
  return region.getByRole("button", { exact: true, name });
}

async function pressOn(target: Locator, key: string): Promise<void> {
  await target.focus();
  await target.press(key);
}

function inGroup(page: Page, agent: string): Locator {
  return inPane(page).getByRole("group", { exact: true, name: `@${agent}` });
}

function field(region: Locator, name: string): Locator {
  return region.getByLabel(name, { exact: true });
}

async function rotated(page: Page): Promise<Locator> {
  const { agent, owner } = await ownerOfAgent("browser-focus-rotate");
  await logInToChannels({ page, token: owner.token, url: `/#/people/${agent}` });
  const rotate = button(inProfile(page), "Rotate token");
  await pressOn(rotate, "Enter");
  await pressOn(button(inDialog(page), "Rotate token"), "Enter");
  return rotate;
}

async function agentMade(page: Page): Promise<Locator> {
  const { owner } = await ownerOfAgent("browser-focus-create");
  const made = unique("browser-focus-made");
  await logInToChannels({ page, token: owner.token, url: "/#/settings/agents" });
  await inPane(page).getByLabel("New agent's name", { exact: true }).fill(made);
  await field(inPane(page), "Its display name").fill("Made bot");
  await page.keyboard.press("Enter");
  return inGroup(page, made);
}

test("a rotated token's Copy token takes focus, and Done gives it back to Rotate token", async ({ page }) => {
  const rotate = await rotated(page);

  await expect(button(inProfile(page), "Copy token")).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(button(inProfile(page), "Done")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(button(inProfile(page), "Copy token")).toBeHidden();
  await expect(rotate).toBeFocused();
});

test("the create-agent form tabs from the name to the display name before Create", async ({ page }) => {
  const { owner } = await ownerOfAgent("browser-focus-form");
  await logInToChannels({ page, token: owner.token, url: "/#/settings/agents" });
  await inPane(page).getByLabel("New agent's name", { exact: true }).focus();
  await page.keyboard.press("Tab");

  await expect(field(inPane(page), "Its display name")).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(button(inPane(page), "Create")).toBeFocused();
});

test("a new agent's Copy token takes focus, and Done gives it to that agent's Rotate token", async ({ page }) => {
  const group = await agentMade(page);

  await expect(button(group, "Copy token")).toBeFocused();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await expect(button(group, "Copy token")).toBeHidden();
  await expect(button(group, "Rotate token")).toBeFocused();
});

async function scheduleListOpen(page: Page, prefix: string): Promise<void> {
  const channel = unique(`${prefix}-room`);
  const reader = await newIdentity({ kind: "human", name: unique(`${prefix}-reader`) });
  await adminClient().createChannel({ name: channel });
  await reader.client.subscribe(channel);
  await reader.client.createScheduledMessage({ channel, cron: "0 9 * * *", text: "Standup", timeZone: "UTC" });
  await logInToChannels({ page, token: reader.token, url: `/#/channels/${channel}` });
  await sidebarLink({ label: `#${channel}`, page }).click({ button: "right" });
  await page.getByRole("menuitem", { exact: true, name: LIST }).click();
}

function inList(page: Page): Locator {
  return page.getByRole("dialog", { exact: true, name: LIST });
}

function editForm(page: Page): Locator {
  return page.getByRole("dialog", { exact: true, name: "Edit a scheduled message" });
}

async function editOpened(page: Page, edit: Locator): Promise<void> {
  await pressOn(edit, "Enter");

  await expect(button(editForm(page), "Save")).toBeEnabled();
}

async function editSaved(page: Page, edit: Locator): Promise<void> {
  await editOpened(page, edit);
  await field(editForm(page), "Text").fill("Standup, edited");

  await expect(button(editForm(page), "Save")).toBeEnabled();

  await page.keyboard.press("Enter");

  await expect(editForm(page)).toBeHidden();
  await expect(inList(page).getByText("Standup, edited", { exact: true })).toBeVisible();
}

test("Pause and Resume keep focus on the toggled button", async ({ page }) => {
  await scheduleListOpen(page, "browser-focus-pause");
  await pressOn(button(inList(page), "Pause"), "Enter");

  await expect(button(inList(page), "Resume")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(button(inList(page), "Pause")).toBeFocused();
});

test("saving or cancelling an edit gives focus back to that message's Edit", async ({ page }) => {
  await scheduleListOpen(page, "browser-focus-edit");
  const edit = button(inList(page), "Edit");
  await editSaved(page, edit);

  await expect(edit).toBeFocused();

  await editOpened(page, edit);
  await pressOn(button(editForm(page), "Cancel"), "Enter");

  await expect(editForm(page)).toBeHidden();
  await expect(edit).toBeFocused();
});

test("the new channel form's Cancel gives focus back to New channel", async ({ page }) => {
  const reader = await newIdentity({ kind: "human", name: unique("browser-focus-channel") });
  await logInToChannels({ page, token: reader.token });
  const open = button(inSidebar(page), "New channel");
  await pressOn(open, "Enter");
  const form = page.getByRole("form", { exact: true, name: "New channel" });
  await pressOn(button(form, "Cancel"), "Enter");

  await expect(form).toBeHidden();
  await expect(open).toBeFocused();
});
