import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test as playwrightTest } from "@playwright/test";
import { createTestAgent } from "../../../testing/index.ts";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = playwrightTest.extend(probeFixtures);

const MANY = 12;
const TWO_DIGITS = 2;
const NONE = 0;
const ONE = 1;
const FIRST = 0;
const LAST = MANY - ONE;
const WHOLLY = 1;
const nowhere = "http://127.0.0.1:9/command";
const schema = { properties: { branch: { type: "string" }, count: { type: "integer" } }, type: "object" } as const;

function manyNames(prefix: string): readonly string[] {
  return Array.from({ length: MANY }, (_value, at) => `${prefix}-${String(at).padStart(TWO_DIGITS, "0")}`);
}

async function messageBoxIn(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-writer` });
  await logIn({ page, token, url: `/#/channels/${channel}` });
  return inPane(page).getByLabel("Message", { exact: true });
}

async function pressDown(page: Page, times: number): Promise<void> {
  if (times === NONE) {
    return;
  }
  await page.keyboard.press("ArrowDown");
  await pressDown(page, times - ONE);
}

interface Scrolled {
  readonly list: Locator;
  readonly options: readonly string[];
}

async function expectLastHighlightedInView({ list, options }: Scrolled): Promise<void> {
  const last = list.getByRole("option").nth(LAST);

  await expect(list.getByRole("option")).toHaveText([...options]);
  await expect(list.getByRole("option", { selected: true })).toHaveText(options[LAST] ?? "");
  await expect(last).toBeInViewport({ ratio: WHOLLY });
  await expect(list.getByRole("option").nth(FIRST)).not.toBeInViewport();
}

async function manyWebhookCommands(prefix: string): Promise<readonly string[]> {
  const names = manyNames(prefix);
  const admin = adminClient();
  await Promise.all(
    names.map(async (name) => {
      await createTestAgent({ by: admin, name, owner: "admin" });
      await admin.addCommand({ name, schema, url: nowhere });
    }),
  );
  return names;
}

test("with 12 mention matches, ↓ 11 times highlights the 12th, scrolled into view, and Enter writes it", async ({
  page,
}) => {
  const names = manyNames(unique("browser-many-mention"));
  await Promise.all(
    names.map(async (name) => {
      await newIdentity({ kind: "human", name });
    }),
  );
  const box = await messageBoxIn(page, unique("browser-many-mentions"));
  await box.pressSequentially(`Ping @${unique("browser-many-mention")}`);
  const list = inPane(page).getByRole("listbox", { exact: true, name: "Mention suggestions" });

  await expect(list.getByRole("option")).toHaveCount(MANY);

  await pressDown(page, LAST);

  await expectLastHighlightedInView({ list, options: names.map((name) => `@${name}`) });

  await page.keyboard.press("Enter");

  await expect(box).toHaveValue(`Ping @${names[LAST] ?? ""} `);
});

test("with 12 Webhook command matches, ↓ 11 times highlights the 12th, scrolled into view, and Enter picks it", async ({
  page,
}) => {
  const names = await manyWebhookCommands(unique("browser-many-command"));
  const box = await messageBoxIn(page, unique("browser-many-commands"));
  await box.pressSequentially(`/${unique("browser-many-command")}`);
  const list = inPane(page).getByRole("listbox", { exact: true, name: "Command suggestions" });

  await expect(list.getByRole("option")).toHaveCount(MANY);

  await pressDown(page, LAST);

  await expectLastHighlightedInView({ list, options: names.map((name) => `/${name}`) });

  await page.keyboard.press("Enter");

  await expect(page.getByRole("form", { exact: true, name: `Call /${names[LAST] ?? ""}` })).toBeVisible();
});
