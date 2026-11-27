import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test as playwrightTest } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = playwrightTest.extend(probeFixtures);

const SCHEDULE = "/scheduleSchedule a message";

async function messageBoxIn(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-writer` });
  await logIn({ page, token, url: `/#/channels/${channel}` });
  return inPane(page).getByLabel("Message", { exact: true });
}

function commandList(page: Page): Locator {
  return inPane(page).getByRole("listbox", { exact: true, name: "Command suggestions" });
}

async function activeOption(box: Locator): Promise<string | null> {
  const id = await box.getAttribute("aria-activedescendant");
  if (id === null) {
    return null;
  }
  return box.page().locator(`[id="${id}"]`).textContent();
}

async function expectActive(box: Locator, text: string | null): Promise<void> {
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe(text);
}

async function expectHighlighted(box: Locator, text: string): Promise<void> {
  await expect(commandList(box.page()).getByRole("option", { selected: true })).toHaveText(text);

  await expectActive(box, text);
}

test("typing / lists /schedule first in a combobox's listbox, highlighted", async ({ page }) => {
  const box = await messageBoxIn(page, unique("browser-schedule-command-roles"));
  await box.pressSequentially("/");
  const combobox = inPane(page).getByRole("combobox", { exact: true, name: "Message" });

  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await expect(combobox).toHaveAttribute("aria-controls", (await commandList(page).getAttribute("id")) ?? "");
  await expect(commandList(page).getByRole("option").first()).toHaveText(SCHEDULE);

  await expectHighlighted(box, SCHEDULE);
});

test("in the Command list, ↑ from /schedule wraps to the last option and ↓ wraps back", async ({ page }) => {
  const box = await messageBoxIn(page, unique("browser-schedule-command-wrap"));
  await box.pressSequentially("/");

  await expectHighlighted(box, SCHEDULE);

  await page.keyboard.press("ArrowUp");

  await expectHighlighted(box, (await commandList(page).getByRole("option").last().textContent()) ?? "");

  await page.keyboard.press("ArrowDown");

  await expectHighlighted(box, SCHEDULE);
});

test("Enter picks /schedule, completing the box and keeping its focus", async ({ page }) => {
  const box = await messageBoxIn(page, unique("browser-schedule-command-pick"));
  await box.pressSequentially("/sch");

  await expectHighlighted(box, SCHEDULE);

  await page.keyboard.press("Enter");

  await expect(box).toHaveValue("/schedule ");
  await expect(commandList(page)).toBeHidden();
  await expect(box).toBeFocused();
});

test("typing a text after /schedule and Enter opens the schedule dialog with it, posting nothing", async ({ page }) => {
  const channel = unique("browser-schedule-command-send");
  const box = await messageBoxIn(page, channel);
  await box.pressSequentially("/sch");
  await page.keyboard.press("Enter");
  await box.pressSequentially("Standup in 5");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { exact: true, name: "Schedule a message" });

  await expect(dialog.getByLabel("Text", { exact: true })).toHaveValue("Standup in 5");
  await expect(adminClient().listMessages(channel)).resolves.toHaveProperty("messages", []);
});

test("Escape closes the Command list and keeps the text, with focus still in the box", async ({ page }) => {
  const box = await messageBoxIn(page, unique("browser-schedule-command-escape"));
  await box.pressSequentially("/sc");

  await expect(commandList(page)).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(commandList(page)).toBeHidden();
  await expect(box).toHaveValue("/sc");
  await expect(box).toBeFocused();
});
