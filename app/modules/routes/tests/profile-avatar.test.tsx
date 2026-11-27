import { avatarPng, hillsPng } from "../../testing/index.ts";
import { expect, it } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { inProfile } from "./regions.ts";
import { newIdentity } from "./identities.ts";
import { openAt } from "./render.tsx";
import { withNodeForms } from "./attachment-posts.ts";

const OVER_TWO_MEGABYTES = 2_000_001;
const ONE = 1;

interface Crew {
  readonly human: CookoutClient;
  readonly stranger: CookoutClient;
}

async function crewOf(prefix: string): Promise<Crew> {
  const human = await newIdentity({ displayName: "Avatar Owner", kind: "human", name: `${prefix}-human` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  const stranger = await newIdentity({ kind: "human", name: `${prefix}-stranger` });
  return { human: human.client, stranger: stranger.client };
}

interface Picked {
  readonly close: () => void;
  readonly group: HTMLElement;
  readonly human: CookoutClient;
  readonly name: string;
}

interface Picking {
  readonly prefix: string;
  readonly file: File;
  readonly whose?: "bot" | "human";
}

function avatarPicker(): HTMLInputElement {
  const picker = inProfile().getByRole("group", { name: "Avatar" }).querySelector("input[type=file]");
  if (!(picker instanceof HTMLInputElement)) {
    throw new TypeError("The avatar has no file picker");
  }
  return picker;
}

async function picked({ file, prefix, whose = "human" }: Picking): Promise<Picked> {
  const { human } = await crewOf(prefix);
  const name = `${prefix}-${whose}`;
  const close = openAt({ client: human, hash: `#/people/${name}` });
  const group = await inProfile().findByRole("group", { name: "Avatar" });
  fireEvent.change(avatarPicker(), { target: { files: [file] } });
  return { close, group, human, name };
}

function pngFile(bytes: Uint8Array): File {
  return new File([Uint8Array.from(bytes)], "face.png", { type: "image/png" });
}

async function avatarIdOf(client: CookoutClient, name: string): Promise<string | null> {
  const { identity } = await client.getIdentity(name);
  const { avatar = null } = identity;
  if (avatar === null) {
    return null;
  }
  return avatar.id;
}

async function savedAvatar(human: CookoutClient, name: string): Promise<string | null> {
  const group = await inProfile().findByRole("group", { name: "Avatar" });
  await within(group).findByRole("img", { name: "New avatar" });
  await withNodeForms(async () => {
    fireEvent.click(within(group).getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(avatarIdOf(human, name)).resolves.not.toBeNull();
    });
  });
  const id = await avatarIdOf(human, name);
  return id;
}

it("you pick an image on your own profile, see it cropped, and Save shows it as your avatar at once", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await picked({ file: pngFile(avatarPng()), prefix: "web-avatar-set-own" });

  await expect(within(opened.group).findByRole("img", { name: "New avatar" })).resolves.toHaveProperty(
    "src",
    expect.stringMatching(/^data:image\/png;base64,/u),
  );

  const id = await savedAvatar(opened.human, opened.name);

  await expect(inProfile().findByRole("img", { name: "Avatar Owner" })).resolves.toHaveProperty(
    "src",
    expect.stringContaining(`/v1/avatars/${String(id)}`),
  );
  expect(within(opened.group).queryByRole("img", { name: "New avatar" })).toBeNull();

  opened.close();
});

it("an owner sets their agent's avatar from its profile", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const opened = await picked({ file: pngFile(avatarPng()), prefix: "web-avatar-set-bot", whose: "bot" });

  await expect(savedAvatar(opened.human, opened.name)).resolves.not.toBeNull();

  opened.close();
});

async function shownTo(client: CookoutClient, name: string): Promise<boolean> {
  const close = openAt({ client, hash: `#/people/${name}` });
  await inProfile().findByRole("heading", { level: 3 });
  const shown = inProfile().queryByRole("group", { name: "Avatar" }) !== null;
  close();
  return shown;
}

it("the Set avatar control shows on nobody else's profile, human or agent", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const prefix = "web-avatar-set-who";
  const { stranger } = await crewOf(prefix);
  const shown = [await shownTo(stranger, `${prefix}-bot`), await shownTo(stranger, `${prefix}-human`)];

  expect(shown).toStrictEqual([false, false]);
});

it("a file over 2 MB is refused at once, in plain words", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const file = new File([new Uint8Array(OVER_TWO_MEGABYTES)], "huge.jpg", { type: "image/jpeg" });
  const { close, group } = await picked({ file, prefix: "web-avatar-set-large" });

  await expect(within(group).findByRole("alert")).resolves.toHaveProperty(
    "textContent",
    "That image is over 2 MB: pick one of at most 2 MB.",
  );
  expect(within(group).queryByRole("button", { name: "Save" })).toBeNull();

  close();
});

it("a file that isn't an image is refused, in plain words", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const file = new File(["not an image"], "notes.png", { type: "image/png" });
  const { close, group } = await picked({ file, prefix: "web-avatar-set-text" });

  await expect(within(group).findByRole("alert")).resolves.toHaveProperty(
    "textContent",
    "That file isn't an image: pick a PNG, JPEG, GIF or WebP.",
  );

  close();
});

it("the server's refusal shows under the picked image, which stays to try again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, group } = await picked({ file: pngFile(hillsPng()), prefix: "web-avatar-set-refused" });
  await within(group).findByRole("img", { name: "New avatar" });

  const alert = await withNodeForms(async () => {
    fireEvent.click(within(group).getByRole("button", { name: "Save" }));
    const said = await within(group).findByRole("alert");
    return said;
  });

  expect(alert.textContent).toMatch(/^Couldn't set the avatar \(avatar_wrong_size\): /u);
  expect(within(group).getByRole("img", { name: "New avatar" })).toBeDefined();

  close();
});

it("pressing Cancel drops the picked image and puts focus back on Set avatar", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, group, human, name } = await picked({ file: pngFile(avatarPng()), prefix: "web-avatar-set-cancel" });
  await within(group).findByRole("img", { name: "New avatar" });

  fireEvent.click(within(group).getByRole("button", { name: "Cancel" }));

  await waitFor(() => {
    expect(within(group).getByRole("button", { name: "Set avatar" })).toBe(document.activeElement);
  });

  expect(within(group).queryByRole("img", { name: "New avatar" })).toBeNull();
  await expect(avatarIdOf(human, name)).resolves.toBeNull();

  close();
});

interface Watched {
  readonly close: () => void;
  readonly opened: () => number;
}

async function watchPicker(prefix: string): Promise<Watched> {
  const { human } = await crewOf(prefix);
  const close = openAt({ client: human, hash: `#/people/${prefix}-human` });
  const group = await inProfile().findByRole("group", { name: "Avatar" });
  const picker = avatarPicker();
  let opened = 0;
  picker.addEventListener("click", () => {
    opened += ONE;
  });
  fireEvent.click(within(group).getByRole("button", { name: "Set avatar" }));
  fireEvent.change(picker, { target: { files: null } });
  return { close, opened: () => opened };
}

it("pressing Set avatar opens the file picker, and picking nothing changes nothing", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, opened } = await watchPicker("web-avatar-set-open");
  const group = inProfile().getByRole("group", { name: "Avatar" });

  expect([opened(), within(group).queryAllByRole("alert"), within(group).queryAllByRole("img")]).toStrictEqual([
    ONE,
    [],
    [],
  ]);

  close();
});
