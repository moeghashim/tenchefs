import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { announced, feedMessage, shown, typing, walk } from "./key-walk.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, inSidebar } from "./regions.ts";
import type { Step } from "./key-walk.ts";
import { createTestAgent } from "../../../testing/index.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const HELLO = "Hello by keys";
const MENTION = "Hi @";

interface Opened {
  readonly channel: string;
  readonly command: string;
}

async function withCommand(channel: string): Promise<string> {
  const command = `${channel}-cmd`;
  await createTestAgent({ by: adminClient(), name: command, owner: "admin" });
  await adminClient().addCommand({
    description: "Ship a branch",
    name: command,
    schema: {
      properties: { branch: { minLength: 1, type: "string" }, count: { type: "integer" } },
      required: ["branch"],
      type: "object",
    },
    url: "http://127.0.0.1:9/command",
  });
  return command;
}

async function opened(page: Page): Promise<Opened> {
  const channel = unique("kbwalk-channel");
  await adminClient().createChannel({ name: channel });
  await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  const command = await withCommand(channel);
  await adminClient().createMessage({ channel, text: "Already here." });
  await logInWithStream({ page, token: reader.token, url: `/#/channels/${channel}` });

  await expect(feedMessage({ page, text: "Already here." })).toBeVisible();

  return { channel, command };
}

function messageBox(page: Page): Locator {
  return inPane(page).getByRole("textbox", { exact: true, name: "Message" });
}

function choosingBox(page: Page): Locator {
  return inPane(page).getByRole("combobox", { exact: true, name: "Message" });
}

function sent(page: Page, text: string): readonly Step[] {
  return [
    ["Enter", messageBox(page)],
    async () => {
      await expect(feedMessage({ page, text })).toBeVisible();
      await expect(messageBox(page)).toHaveValue("");
    },
  ];
}

async function posted(page: Page, { channel, command }: Opened): Promise<void> {
  const box = messageBox(page);
  const branch = page
    .getByRole("form", { exact: true, name: `Call /${command}` })
    .getByRole("textbox", { exact: true, name: "branch" });
  await walk({
    page,
    steps: [
      ["Tab", inSidebar(page).getByRole("button", { exact: true, name: "Collapse sidebar" })],
      ["Control+]", feedMessage({ page, text: "Already here." })],
      ["ArrowDown", box],
      typing({ into: box, page, text: HELLO }),
      ...sent(page, HELLO),
      typing({ after: choosingBox(page), into: box, page, text: `${MENTION}${channel}-pos` }),
      shown(page.getByRole("listbox", { exact: true, name: "Mention suggestions" })),
      ["Tab", box],
      ...sent(page, MENTION),
      typing({ after: choosingBox(page), into: box, page, text: `/${command}` }),
      shown(page.getByRole("listbox", { exact: true, name: "Command suggestions" })),
      ["Tab", branch],
      typing({ into: branch, page, text: "main" }),
      ...sent(page, `/${command}`),
    ],
  });
}

test("posting, mentioning and calling a command with its data work by keys alone", async ({ page }) => {
  const channel = await opened(page);
  await posted(page, channel);

  await expect(feedMessage({ page, text: `${MENTION}${channel.channel}-poster` })).toBeVisible();
});

test("every message action works by keys alone, focus always on a message or its menu", async ({ page }) => {
  const channel = await opened(page);
  await posted(page, channel);
  const hello = feedMessage({ page, text: HELLO });
  const mention = feedMessage({ page, text: MENTION });
  const menu = page.getByRole("menu", { exact: true, name: "Message actions" });
  await walk({
    page,
    steps: [
      ["Escape", feedMessage({ page, text: `/${channel.command}` })],
      ["k", mention],
      ["k", hello],
      ["+", hello],
      shown(hello.getByRole("button", { exact: true, name: "👍 1" })),
      ["-", hello],
      shown(hello.getByRole("button", { exact: true, name: "👎 1" })),
      ["l", hello],
      announced({ page, text: "Link copied" }),
      ["x", mention],
      announced({ page, text: "Thread closed" }),
      ["k", inPane(page).getByRole("article", { exact: true, name: "1 closed thread" })],
      ["Enter", hello],
      ["x", hello],
      announced({ page, text: "Thread reopened" }),
      ["Alt+Enter", hello],
      announced({ page, text: "Marked unread" }),
      ["Shift+F10", menu.getByRole("menuitem").first()],
      ["Escape", hello],
    ],
  });

  await expect(menu).toBeHidden();
});
