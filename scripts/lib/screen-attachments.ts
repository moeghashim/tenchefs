import type { Page } from "@playwright/test";
import type { Screen } from "./screens.ts";
import { createCookoutClient } from "../../app/modules/sdk/index.ts";

interface Owner {
  readonly url: string;
  readonly ownerToken: string;
  readonly image: Uint8Array;
}

const NOTES_LENGTH = 2048;
const OVER_TEN_MB = 10_000_001;

interface PickedFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

interface Attaching {
  readonly image: Uint8Array;
  readonly page: Page;
  readonly screen: Screen;
  readonly timeout: number;
}

interface Picking {
  readonly attach: Required<Screen>["attach"];
  readonly image: Uint8Array;
}

function filesFor({ attach, image }: Picking): readonly PickedFile[] {
  const files: PickedFile[] = [
    { buffer: Buffer.from(image), mimeType: "image/png", name: "hills.png" },
    { buffer: Buffer.from("x".repeat(NOTES_LENGTH)), mimeType: "text/plain", name: "notes.txt" },
  ];
  if (attach === "refused") {
    files.push({ buffer: Buffer.alloc(OVER_TEN_MB), mimeType: "application/octet-stream", name: "dump.bin" });
  }
  return files;
}

export async function attachScreenFiles({ image, page, screen, timeout }: Attaching): Promise<void> {
  if (typeof screen.attach === "string") {
    const files = filesFor({ attach: screen.attach, image });
    await page.locator("main input[type=file]").setInputFiles([...files], { timeout });
  }
}

export async function postScreenAttachments({ image, ownerToken, url }: Owner): Promise<void> {
  const owner = createCookoutClient({ env: {}, token: ownerToken, url });
  await owner.createChannel({ name: "design" });
  await owner.createMessage({
    attachments: [
      { bytes: image, name: "hills.png" },
      { bytes: new TextEncoder().encode("x".repeat(NOTES_LENGTH)), name: "notes.txt" },
    ],
    channel: "design",
    text: "The view from the office, and my notes.",
  });
}
