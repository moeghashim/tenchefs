import type { Locator, Page } from "@playwright/test";
import { copiesRecorded, tokenCopied, walk } from "./walk.ts";
import type { Step } from "./walk.ts";
import { test as base } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

function link(page: Page, name: string): Locator {
  return inPane(page).getByRole("link", { exact: true, name });
}

function heading(page: Page, name: string): Locator {
  return inPane(page).getByRole("heading", { exact: true, level: 2, name });
}

function field(page: Page, name: string): Locator {
  return inPane(page).getByRole("textbox", { exact: true, name });
}

function button(page: Page, name: string): Locator {
  return inPane(page).getByRole("button", { exact: true, name });
}

function theme(page: Page, name: string): Locator {
  return inPane(page)
    .getByRole("radiogroup", { exact: true, name: "Theme" })
    .getByRole("radio", { checked: true, exact: true, name });
}

function sectionSteps(page: Page, name: string): readonly Step[] {
  return [
    { focused: heading(page, name), keys: "Enter" },
    { focused: link(page, name), keys: "Tab" },
  ];
}

function profileAndThemeSteps(page: Page): readonly Step[] {
  return [
    ...sectionSteps(page, "Profile"),
    { focused: field(page, "Your display name"), keys: "Tab" },
    { focused: field(page, "Your display name"), keys: "Walker", typed: true },
    { focused: button(page, "Save"), keys: "Tab" },
    { focused: button(page, "Save"), keys: "Enter" },
    { focused: link(page, "Theme"), keys: "Tab" },
    ...sectionSteps(page, "Theme"),
    { focused: theme(page, "System"), keys: "Tab" },
    { focused: theme(page, "Light"), keys: "ArrowRight", shows: [page.locator('html[data-theme="light"]')] },
    { focused: theme(page, "Dark"), keys: "ArrowRight", shows: [page.locator('html[data-theme="dark"]')] },
    { focused: theme(page, "Light"), keys: "ArrowLeft" },
    { focused: theme(page, "System"), keys: "ArrowLeft" },
  ];
}

function agentSteps(page: Page, agent: string): readonly Step[] {
  const card = inPane(page).getByRole("group", { exact: true, name: `@${agent}` });
  return [
    { focused: link(page, "My agents"), keys: "Tab" },
    ...sectionSteps(page, "My agents"),
    { focused: field(page, "New agent's name"), keys: "Tab" },
    { focused: field(page, "New agent's name"), keys: agent, typed: true },
    { focused: field(page, "Its display name"), keys: "Tab" },
    { focused: field(page, "Its display name"), keys: "Walked agent", typed: true },
    { focused: button(page, "Copy token"), keys: "Enter" },
    { focused: button(page, "Copy token"), keys: "Enter", shows: [tokenCopied(page)] },
    { focused: button(page, "Done"), keys: "Tab" },
    {
      focused: card.getByRole("button", { exact: true, name: "Rotate token" }),
      gone: [button(page, "Copy token")],
      keys: "Enter",
    },
  ];
}

function sessionSteps(page: Page): readonly Step[] {
  return [
    { focused: inPane(page).getByRole("button", { exact: true, name: "Deactivate" }), keys: "Tab" },
    { focused: field(page, "New agent's name"), keys: "Tab" },
    { focused: field(page, "Its display name"), keys: "Tab" },
    { focused: button(page, "Create"), keys: "Tab" },
    { focused: link(page, "Sessions"), keys: "Tab" },
    ...sectionSteps(page, "Sessions"),
    { focused: button(page, "Revoke"), keys: "Tab" },
    { focused: button(page, "Log out"), keys: "Tab" },
    { focused: page.getByLabel("Token", { exact: true }), keys: "Enter" },
  ];
}

test("Settings by keyboard alone: each section, display names, the theme choice, creating an agent with its token shown once, and logging out", async ({
  page,
}) => {
  await copiesRecorded(page);
  const me = unique("browser-walk-settings");
  const { token } = await newIdentity({ kind: "human", name: me });
  await logIn({ page, token, url: "/#/settings" });
  await link(page, "Profile").focus();
  await walk({
    page,
    steps: [...profileAndThemeSteps(page), ...agentSteps(page, `${me}-made`), ...sessionSteps(page)],
  });
});
