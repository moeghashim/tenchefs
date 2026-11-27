import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { copiesRecorded, tokenCopied, walk } from "./walk.ts";
import { inDialog, inPane, inProfile } from "./regions.ts";
import type { Step } from "./walk.ts";
import { createTestAgent } from "../../../testing/index.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const HEADERS = "Extra headers (values write-only), one name: value per line. Saving replaces them all.";
const SECOND = 1;

interface Cast {
  readonly bot: string;
  readonly heir: string;
  readonly viewer: string;
}

interface Walking {
  readonly cast: Cast;
  readonly page: Page;
}

function button(page: Page, name: string): Locator {
  return inProfile(page).getByRole("button", { exact: true, name });
}

function inConfirm(page: Page, name: string): Locator {
  return inDialog(page).getByRole("button", { exact: true, name });
}

function textbox(page: Page, name: string): Locator {
  return inProfile(page).getByRole("textbox", { exact: true, name });
}

async function agentProfileOpen(page: Page): Promise<Cast> {
  const prefix = unique("browser-walk-agent");
  const cast = { bot: `${prefix}-bot`, heir: `${prefix}-heir`, viewer: `${prefix}-viewer` };
  const me = await newIdentity({ kind: "human", name: cast.viewer });
  await adminClient().makeAdmin(cast.viewer);
  await newIdentity({ kind: "human", name: cast.heir });
  await createTestAgent({ by: me.client, name: cast.bot });
  await me.client.join({ as: cast.bot });
  await logIn({ page, token: me.token, url: `/#/people/${cast.bot}` });

  await expect(button(page, "Revoke session")).toBeVisible();

  return cast;
}

function textSteps({ page }: Walking): readonly Step[] {
  const saves = inProfile(page).getByRole("button", { exact: true, name: "Save" });
  return [
    { focused: button(page, "Set avatar"), keys: "Tab" },
    { focused: textbox(page, "Display name"), keys: "Tab" },
    { focused: textbox(page, "Display name"), keys: "ControlOrMeta+a" },
    { focused: textbox(page, "Display name"), keys: "Walked Bot", typed: true },
    { focused: saves.first(), keys: "Tab" },
    { focused: saves.first(), keys: "Enter", shows: [inProfile(page).getByText("Walked Bot", { exact: true })] },
    { focused: textbox(page, "Description"), keys: "Tab" },
    { focused: textbox(page, "Description"), keys: "Walks the board.", typed: true },
    { focused: saves.nth(SECOND), keys: "Tab" },
    { focused: saves.nth(SECOND), keys: "Enter" },
  ];
}

function triggerSteps({ page }: Walking): readonly Step[] {
  const token = inProfile(page).getByLabel("Token (write-only: never shown again)", { exact: true });
  return [
    { focused: textbox(page, "Trigger URL"), keys: "Tab" },
    { focused: textbox(page, "Trigger URL"), keys: "https://routines.example.com/fire", typed: true },
    { focused: token, keys: "Tab" },
    { focused: token, keys: "walk-secret", typed: true },
    { focused: textbox(page, HEADERS), keys: "Tab" },
    { focused: button(page, "Save trigger URL"), keys: "Tab" },
    { focused: button(page, "Save trigger URL"), keys: "Enter", shows: [button(page, "Clear")] },
    { focused: button(page, "Clear"), keys: "Tab" },
  ];
}

function rotateSteps({ page }: Walking): readonly Step[] {
  const rotate = button(page, "Rotate token");
  return [
    { focused: inConfirm(page, "Cancel"), keys: "Enter" },
    { focused: rotate, gone: [inDialog(page)], keys: "Escape" },
    { focused: inConfirm(page, "Cancel"), keys: "Enter" },
    { focused: inConfirm(page, "Rotate token"), keys: "Tab" },
    { focused: button(page, "Copy token"), keys: "Enter" },
    { focused: button(page, "Copy token"), keys: "Enter", shows: [tokenCopied(page)] },
    { focused: button(page, "Done"), keys: "Tab" },
    { focused: rotate, gone: [button(page, "Copy token")], keys: "Enter" },
  ];
}

function revokeSteps({ page }: Walking): readonly Step[] {
  const revoke = button(page, "Revoke session");
  return [
    { focused: revoke, keys: "Tab" },
    { focused: inConfirm(page, "Cancel"), keys: "Enter" },
    { focused: revoke, gone: [inDialog(page)], keys: "Escape" },
    { focused: inConfirm(page, "Cancel"), keys: "Enter" },
    { focused: inConfirm(page, "Revoke session"), keys: "Tab" },
    { focused: button(page, "Rotate token"), gone: [revoke, inDialog(page)], keys: "Enter" },
  ];
}

function transferSteps({ cast, page }: Walking): readonly Step[] {
  const field = textbox(page, "Transfer to (a human's name)");
  return [
    { focused: button(page, "Delete"), keys: "Tab" },
    { focused: field, keys: "Tab" },
    { focused: field, keys: cast.heir, typed: true },
    { focused: inConfirm(page, "Cancel"), keys: "Enter" },
    { focused: inConfirm(page, `Transfer to @${cast.heir}`), keys: "Tab" },
    {
      focused: field,
      keys: "Enter",
      shows: [inProfile(page).getByText(`Agent · owned by ${cast.heir}`, { exact: true })],
    },
  ];
}

function deleteSteps({ cast, page }: Walking): readonly Step[] {
  const remove = button(page, "Delete");
  const deleted = page.getByText(`@${cast.bot} was deleted, so its profile closed.`, { exact: true });
  return [
    { focused: remove, keys: "Shift+Tab" },
    { focused: inConfirm(page, "Cancel"), keys: "Enter" },
    { focused: remove, gone: [inDialog(page)], keys: "Escape" },
    { focused: inConfirm(page, "Cancel"), keys: "Enter" },
    { focused: inConfirm(page, `Delete @${cast.bot}`), keys: "Tab" },
    {
      focused: inPane(page).getByRole("heading", { exact: true, level: 1, name: "People & agents" }),
      gone: [inProfile(page)],
      keys: "Enter",
      shows: [deleted],
    },
  ];
}

test("an agent's profile by keyboard alone: display name, description, trigger URL and token, Revoke, Rotate token, copy token, Transfer and Delete", async ({
  page,
}) => {
  await copiesRecorded(page);
  const walking = { cast: await agentProfileOpen(page), page };
  await inProfile(page).getByRole("link", { exact: true, name: "Close profile" }).focus();
  await walk({
    page,
    steps: [
      ...textSteps(walking),
      ...triggerSteps(walking),
      ...revokeSteps(walking),
      ...rotateSteps(walking),
      ...transferSteps(walking),
      ...deleteSteps(walking),
    ],
  });
});
