import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AvatarId } from "../../../avatars/index.ts";
import { inProfile } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { unique } from "./names.ts";

const PHOTO = { height: 400, width: 600 } as const;
const STRIPES =
  '<div style="display:flex;height:400px;margin:0"><i style="width:100px;background:#f00"></i><i style="width:200px;background:#0f0"></i><i style="width:200px;background:#00f"></i><i style="width:100px;background:#f00"></i></div>';
const SIDE = 256;
const NEAR_LEFT = 20;
const NEAR_RIGHT = 236;
const MIDDLE = 128;
const PIXEL = 1;
const ORIGIN = 0;
const FIRST = 0;
const CHANNELS = 3;
const COLOURS = ["red", "green", "blue"] as const;
const SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const SIGNATURE_END = 8;
const WIDTH_AT = 16;
const HEIGHT_AT = 20;
const OVER_TWO_MEGABYTES = 2_000_001;
const NONE = 0;

interface Opened {
  readonly field: Locator;
  readonly name: string;
  readonly person: Awaited<ReturnType<typeof newIdentity>>;
}

interface Point {
  readonly left: number;
  readonly top: number;
}

interface Sampling {
  readonly origin: number;
  readonly pixel: number;
  readonly points: readonly Point[];
  readonly src: string;
}

async function ownProfile(page: Page, prefix: string): Promise<Opened> {
  const name = unique(prefix);
  const person = await newIdentity({ displayName: "Avatar Setter", kind: "human", name });
  await logIn({ page, token: person.token, url: `/#/people/${name}` });
  const field = inProfile(page).getByRole("group", { exact: true, name: "Avatar" });

  await expect(field.getByRole("button", { exact: true, name: "Set avatar" })).toBeVisible();

  return { field, name, person };
}

async function stripedJpeg(page: Page): Promise<Buffer> {
  const painter = await page.context().newPage();
  await painter.setViewportSize(PHOTO);
  await painter.setContent(`<body style="margin:0">${STRIPES}</body>`);
  const jpeg = await painter.screenshot({ type: "jpeg" });
  await painter.close();
  return jpeg;
}

function colourOf(rgba: readonly number[]): string {
  const channels = rgba.slice(FIRST, CHANNELS);
  return COLOURS[channels.indexOf(Math.max(...channels))] ?? "none";
}

async function sampled(page: Page, sampling: Sampling): Promise<readonly string[]> {
  const pixels = await page.evaluate(async (asked: Readonly<Sampling>) => {
    const image = new Image();
    image.src = asked.src;
    await image.decode();
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new TypeError("No 2D canvas");
    }
    context.drawImage(image, asked.origin, asked.origin);
    return asked.points.map((point) => [...context.getImageData(point.left, point.top, asked.pixel, asked.pixel).data]);
  }, sampling);
  return pixels.map((pixel: readonly number[]) => colourOf(pixel));
}

async function storedAvatar(page: Page, id: AvatarId | null): Promise<readonly unknown[]> {
  const response = await page.request.get(`/v1/avatars/${String(id)}`);
  const png = await response.body();
  const colours = await sampled(page, {
    origin: ORIGIN,
    pixel: PIXEL,
    points: [
      { left: NEAR_LEFT, top: MIDDLE },
      { left: NEAR_RIGHT, top: MIDDLE },
    ],
    src: `data:image/png;base64,${png.toString("base64")}`,
  });
  return [
    png.subarray(FIRST, SIGNATURE_END).equals(SIGNATURE),
    png.readUInt32BE(WIDTH_AT),
    png.readUInt32BE(HEIGHT_AT),
    colours,
  ];
}

async function avatarIdOf({ name, person }: Opened): Promise<AvatarId | null> {
  const { identity } = await person.client.getIdentity(name);
  const { avatar = null } = identity;
  if (avatar === null) {
    return null;
  }
  return avatar.id;
}

test("a 600 by 400 JPEG is cropped to its centred square and stored as a 256 by 256 PNG", async ({ page }) => {
  const opened = await ownProfile(page, "browser-avatar-set-crop");
  const jpeg = await stripedJpeg(page);
  await opened.field
    .locator("input[type=file]")
    .setInputFiles({ buffer: jpeg, mimeType: "image/jpeg", name: "photo.jpg" });

  await expect(opened.field.getByRole("img", { exact: true, name: "New avatar" })).toHaveJSProperty(
    "naturalWidth",
    SIDE,
  );

  await opened.field.getByRole("button", { exact: true, name: "Save" }).click();

  await expect
    .poll(async () => {
      const shown = await avatarIdOf(opened);
      return shown;
    })
    .not.toBeNull();

  const id = await avatarIdOf(opened);

  await expect(inProfile(page).getByRole("img", { exact: true, name: "Avatar Setter" })).toHaveAttribute(
    "src",
    new RegExp(`/v1/avatars/${String(id)}$`, "u"),
  );
  await expect(storedAvatar(page, id)).resolves.toStrictEqual([true, SIDE, SIDE, ["green", "blue"]]);
});

test("a file over 2 MB is refused before anything is sent", async ({ page }) => {
  const { field } = await ownProfile(page, "browser-avatar-set-large");
  await field
    .locator("input[type=file]")
    .setInputFiles({ buffer: Buffer.alloc(OVER_TWO_MEGABYTES), mimeType: "image/jpeg", name: "huge.jpg" });

  await expect(field.getByRole("alert")).toHaveText("That image is over 2 MB: pick one of at most 2 MB.");
});

test("a file that isn't an image is refused in plain words", async ({ page }) => {
  const { field } = await ownProfile(page, "browser-avatar-set-text");
  await field
    .locator("input[type=file]")
    .setInputFiles({ buffer: Buffer.from("not an image"), mimeType: "image/png", name: "notes.png" });

  await expect(field.getByRole("alert")).toHaveText("That file isn't an image: pick a PNG, JPEG, GIF or WebP.");
  await expect(field.getByRole("button", { exact: true, name: "Save" })).toHaveCount(NONE);
});
