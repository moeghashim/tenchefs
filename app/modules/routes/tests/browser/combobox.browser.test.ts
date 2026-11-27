import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { expect, test as playwrightTest } from "@playwright/test";
import { createTestAgent } from "../../../testing/index.ts";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = playwrightTest.extend(probeFixtures);

const nowhere = "http://127.0.0.1:9/command";
const schema = { properties: { branch: { type: "string" }, count: { type: "integer" } }, type: "object" } as const;

async function messageBoxIn(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const { token } = await newIdentity({ kind: "human", name: `${channel}-writer` });
  await logIn({ page, token, url: `/#/channels/${channel}` });
  return inPane(page).getByLabel("Message", { exact: true });
}

async function activeOption(box: Locator): Promise<string | null> {
  const id = await box.getAttribute("aria-activedescendant");
  if (id === null) {
    return null;
  }
  return box.page().locator(`[id="${id}"]`).textContent();
}

async function twoWebhookCommands(base: string): Promise<string> {
  const prefix = unique(base);
  const admin = adminClient();
  await Promise.all(
    [`${prefix}-first`, `${prefix}-second`].map(async (name) => {
      await createTestAgent({ by: admin, name, owner: "admin" });
      await admin.addCommand({ name, schema, url: nowhere });
    }),
  );
  return prefix;
}

function listIn(page: Page, name: string): Locator {
  return inPane(page).getByRole("listbox", { exact: true, name });
}

test("typing @grace's name shows the mention list as a combobox's listbox, and Tab writes @grace", async ({ page }) => {
  const grace = unique("grace");
  await newIdentity({ kind: "human", name: grace });
  const box = await messageBoxIn(page, unique("browser-combobox-tab"));
  await box.pressSequentially(`@${grace}`);

  await expect(inPane(page).getByRole("combobox", { exact: true, name: "Message" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(listIn(page, "Mention suggestions").getByRole("option", { selected: true })).toHaveText(`@${grace}`);
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe(`@${grace}`);

  await page.keyboard.press("Tab");

  await expect(box).toHaveValue(`@${grace} `);
  await expect(box).toBeFocused();
});

test('"@ " as dictation types it keeps the mention list open, and Tab writes the top match', async ({ page }) => {
  await newIdentity({ kind: "human", name: unique("browser-combobox-spoken-reader") });
  const box = await messageBoxIn(page, unique("browser-combobox-spoken"));
  await box.pressSequentially("Ping @");

  await expect(listIn(page, "Mention suggestions")).toBeVisible();

  await box.pressSequentially(" ");
  const top = listIn(page, "Mention suggestions").getByRole("option", { selected: true });

  await expect(top).toHaveText(/^@[a-z0-9-]+/u);

  const [name] = /^@[a-z0-9-]+/u.exec((await top.textContent()) ?? "") ?? [""];
  await page.keyboard.press("Tab");

  await expect(box).toHaveValue(`Ping ${name} `);
});

test('"@ g" filters the list as "@g" does, and Tab writes @grace', async ({ page }) => {
  const grace = unique("grace");
  await newIdentity({ kind: "human", name: grace });
  const box = await messageBoxIn(page, unique("browser-combobox-spoken-g"));
  await box.pressSequentially(`@ ${grace}`);

  await expect(listIn(page, "Mention suggestions").getByRole("option", { selected: true })).toHaveText(`@${grace}`);

  await page.keyboard.press("Tab");

  await expect(box).toHaveValue(`@${grace} `);
});

test('a spoken "at grace" stays text and opens no list', async ({ page }) => {
  const grace = unique("grace");
  await newIdentity({ kind: "human", name: grace });
  const box = await messageBoxIn(page, unique("browser-combobox-spoken-at"));
  await box.pressSequentially(`at ${grace}`);

  await expect(box).toHaveValue(`at ${grace}`);
  await expect(listIn(page, "Mention suggestions")).toBeHidden();
});

test("Escape closes the mention list and keeps the text, with focus still in the box", async ({ page }) => {
  await newIdentity({ kind: "human", name: unique("browser-combobox-escape-reader") });
  const box = await messageBoxIn(page, unique("browser-combobox-escape"));
  await box.pressSequentially("Ping @browser-combobox-escape-r");

  await expect(listIn(page, "Mention suggestions")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(listIn(page, "Mention suggestions")).toBeHidden();
  await expect(box).toHaveValue("Ping @browser-combobox-escape-r");
  await expect(box).toBeFocused();
});

test("typing / lists Webhook commands with the same roles, and the arrows move the active option", async ({ page }) => {
  const prefix = await twoWebhookCommands("browser-combobox");
  const box = await messageBoxIn(page, unique("browser-combobox-command"));
  await box.pressSequentially("/");

  await expect(listIn(page, "Command suggestions")).toBeVisible();

  await box.pressSequentially(`${prefix}-`);

  await expect(listIn(page, "Command suggestions").getByRole("option")).toHaveText([
    `/${prefix}-first`,
    `/${prefix}-second`,
  ]);
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe(`/${prefix}-first`);

  await page.keyboard.press("ArrowDown");

  await expect(listIn(page, "Command suggestions").getByRole("option", { selected: true })).toHaveText(
    `/${prefix}-second`,
  );
  await expect
    .poll(async () => {
      const active = await activeOption(box);
      return active;
    })
    .toBe(`/${prefix}-second`);
});

test("Escape closes the Webhook command list keeping the text, and Tab picks a Webhook command", async ({ page }) => {
  const prefix = await twoWebhookCommands("browser-combo-keys");
  const box = await messageBoxIn(page, unique("browser-combobox-command-keys"));
  await box.pressSequentially(`/${prefix}-`);

  await expect(listIn(page, "Command suggestions").getByRole("option")).toHaveText([
    `/${prefix}-first`,
    `/${prefix}-second`,
  ]);

  await page.keyboard.press("Escape");

  await expect(listIn(page, "Command suggestions")).toBeHidden();
  await expect(box).toHaveValue(`/${prefix}-`);

  await box.pressSequentially("s");
  await page.keyboard.press("Tab");

  await expect(page.getByRole("form", { exact: true, name: `Call /${prefix}-second` })).toBeVisible();
});
