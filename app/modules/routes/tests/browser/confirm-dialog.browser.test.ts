import { test as base, expect } from "@playwright/test";
import { inDialog, inProfile } from "./regions.ts";
import type { Page } from "@playwright/test";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

function agentName(): string {
  return unique("browser-confirm-bot");
}

async function openAgentProfile(page: Page): Promise<void> {
  const owner = unique("browser-confirm-owner");
  const agent = agentName();
  const { token } = await newIdentity({ kind: "human", name: owner });
  await newIdentity({ kind: "agent", name: agent, owner });
  await logIn({ page, token });
  await page.goto(`/#/people/${agent}`);
}

function focusedText(): string {
  const focused = globalThis.document.activeElement;
  if (focused === null) {
    return "";
  }
  return focused.textContent;
}

async function focusedAfterKey(page: Page, key: string): Promise<string> {
  await page.keyboard.press(key);
  const text = await page.evaluate(focusedText);
  return text;
}

async function tabOrder(page: Page): Promise<readonly string[]> {
  const first = await focusedAfterKey(page, "Tab");
  const second = await focusedAfterKey(page, "Tab");
  const back = await focusedAfterKey(page, "Shift+Tab");
  return [first, second, back];
}

test("the confirmation dialog keeps focus inside while open, and Escape gives it back to the button that opened it", async ({
  page,
}) => {
  await openAgentProfile(page);
  const agent = agentName();
  const deactivate = inProfile(page).getByRole("button", { exact: true, name: "Deactivate" });
  await deactivate.click();

  await expect(inDialog(page).getByRole("button", { exact: true, name: "Cancel" })).toBeFocused();

  await expect(tabOrder(page)).resolves.toStrictEqual([`Deactivate @${agent}`, "Cancel", `Deactivate @${agent}`]);

  await page.keyboard.press("Escape");

  await expect(inDialog(page)).toBeHidden();
  await expect(deactivate).toBeFocused();
});
