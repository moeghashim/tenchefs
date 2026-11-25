import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { bannerPng, hillsPng } from "../../../testing/index.ts";
import { expect, test } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { unique } from "./names.ts";

const OUTSIDE = { left: 4, top: 4 } as const;
const NATURAL_WIDTH = 480;
const BANNER_WIDTH = 864;
const NOT_AN_IMAGE = new TextEncoder().encode("not an image");
const LONG_NAME = "Screenshot_2026-11-25_at_10.41.07_from_the_board.png";
const NONE = 0;
const TRANSPARENT = "rgba(0, 0, 0, 0)";

interface Opened {
  readonly thumbnail: Locator;
  readonly dialog: Locator;
}

async function openChannelWithImage(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "human", name: `${channel}-ann` });
  await poster.client.createMessage({
    attachments: [{ bytes: hillsPng(), name: "hills.png" }],
    channel,
    text: "The view from the office",
  });
  await logInToChannels({ page, token: poster.token });
  await page.goto(`/#/channels/${channel}`);
  return inPane(page).getByRole("button", { exact: true, name: "hills.png" });
}

async function openedFullSize(page: Page, channel: string): Promise<Opened> {
  const thumbnail = await openChannelWithImage(page, channel);
  await thumbnail.focus();
  await page.keyboard.press("Enter");
  return { dialog: page.getByRole("dialog", { exact: true, name: "hills.png" }), thumbnail };
}

test("Enter on a thumbnail opens the image at full size, and Escape closes it, back on the thumbnail", async ({
  page,
}) => {
  const { dialog, thumbnail } = await openedFullSize(page, unique("browser-attachments-escape"));

  await expect(dialog.getByRole("img", { exact: true, name: "hills.png" })).toHaveJSProperty(
    "naturalWidth",
    NATURAL_WIDTH,
  );

  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
  await expect(thumbnail).toBeFocused();
});

test("a click outside the full-size image closes it, back on the thumbnail", async ({ page }) => {
  const { dialog, thumbnail } = await openedFullSize(page, unique("browser-attachments-outside"));

  await expect(dialog.getByRole("img", { exact: true, name: "hills.png" })).toBeVisible();

  await page.mouse.click(OUTSIDE.left, OUTSIDE.top);

  await expect(dialog).toBeHidden();
  await expect(thumbnail).toBeFocused();
});

async function openComposer(page: Page, channel: string): Promise<Locator> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "human", name: `${channel}-ann` });
  await logInToChannels({ page, token: poster.token });
  await page.goto(`/#/channels/${channel}`);
  return inPane(page).getByRole("form", { exact: true, name: "Post to the channel" });
}

async function violationsRecorded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    globalThis.document.addEventListener(
      "securitypolicyviolation",
      ({ blockedURI, effectiveDirective }: Pick<SecurityPolicyViolationEvent, "blockedURI" | "effectiveDirective">) => {
        const { dataset } = globalThis.document.documentElement;
        dataset["violations"] = `${dataset["violations"] ?? ""}${effectiveDirective} ${blockedURI}; `;
      },
    );
  });
}

async function violationsOf(page: Page): Promise<string> {
  const violations = await page.locator("html").getAttribute("data-violations");
  return violations ?? "";
}

interface Pasting {
  readonly bytes: Uint8Array;
  readonly form: Locator;
  readonly name: string;
}

async function pasteImage({ bytes, form, name }: Pasting): Promise<Locator> {
  await form.getByRole("textbox").focus();
  await form.page().evaluate(
    ({ png, pastedName }: { readonly png: readonly number[]; readonly pastedName: string }) => {
      const pasted = new DataTransfer();
      pasted.items.add(new File([Uint8Array.from(png)], pastedName, { type: "image/png" }));
      (document.activeElement ?? document.body).dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: pasted }),
      );
    },
    { pastedName: name, png: [...bytes] },
  );
  return form.getByRole("img", { exact: true, name });
}

test("an image pasted into the message box shows its preview under the live CSP, which blocks nothing", async ({
  page,
}) => {
  await violationsRecorded(page);
  const form = await openComposer(page, unique("browser-compose-paste"));
  const preview = await pasteImage({ bytes: bannerPng(), form, name: "banner.png" });

  await expect(preview).toHaveJSProperty("naturalWidth", BANNER_WIDTH);
  expect(await violationsOf(page)).toBe("");
});

test("a pasted image that can't be shown keeps its name inside the preview's tile, unseen", async ({ page }) => {
  const form = await openComposer(page, unique("browser-compose-broken"));
  const preview = await pasteImage({ bytes: NOT_AN_IMAGE, form, name: LONG_NAME });

  await expect(preview).toHaveJSProperty("complete", true);
  await expect(preview).toHaveJSProperty("naturalWidth", NONE);
  await expect(preview).toHaveCSS("overflow", "hidden");
  await expect(preview).toHaveCSS("color", TRANSPARENT);
  await expect(preview).toHaveCSS("width", "72px");
  await expect(preview).toHaveCSS("height", "48px");
});

test("files picked with the Attach files button are sent with the message and show under it", async ({ page }) => {
  const form = await openComposer(page, unique("browser-compose-pick"));
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    form.getByRole("button", { exact: true, name: "Attach files" }).click(),
  ]);
  await fileChooser.setFiles([
    { buffer: Buffer.from(hillsPng()), mimeType: "image/png", name: "hills.png" },
    { buffer: Buffer.from("notes"), mimeType: "text/plain", name: "notes.txt" },
  ]);
  await form.getByRole("textbox").fill("The view");
  await form.getByRole("button", { exact: true, name: "Send" }).click();
  const shown = inPane(page).getByRole("list", { exact: true, name: "Attachments" });

  await expect(shown.getByRole("button", { exact: true, name: "hills.png" })).toBeVisible();
  await expect(shown.getByRole("link", { exact: true, name: "notes.txt 5 B" })).toBeVisible();
  await expect(form.getByRole("list", { exact: true, name: "Files to send" })).toBeHidden();
});
