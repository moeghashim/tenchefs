import type { ClientMethod, OpenedView } from "./view-opened.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { inProfile } from "./regions.ts";
import { profileOpened } from "./view-opened.ts";

async function adminOf(prefix: string): Promise<CookoutClient> {
  const viewer = await newIdentity({ kind: "human", name: `${prefix}-viewer` });
  await newIdentity({ kind: "human", name: `${prefix}-human` });
  await adminClient().makeAdmin(`${prefix}-viewer`);
  return viewer.client;
}

async function profileName(): Promise<string> {
  const heading = await inProfile().findByRole("heading", { level: 3 });
  return heading.textContent;
}

function rowOf(name: string): HTMLElement {
  return within(screen.getByRole("list", { name: "Identities" })).getByRole("link", {
    name: (label) => label.startsWith(name),
  });
}

interface AdminClick {
  readonly answered: OpenedView["answered"];
  readonly button: string;
  readonly method: ClientMethod;
}

async function adminClicked({ answered, button, method }: AdminClick): Promise<void> {
  fireEvent.click(await inProfile().findByRole("button", { name: button }));
  await answered(method);
}

it("an admin makes a human an admin from their profile and removes it, the tag following on profile and row", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { answered, close } = await profileOpened({
    client: await adminOf("web-people-promote"),
    name: "web-people-promote-human",
  });
  await adminClicked({ answered, button: "Make admin", method: "makeAdmin" });
  const promoted = [await profileName(), rowOf("web-people-promote-human").textContent];
  await adminClicked({ answered, button: "Remove admin", method: "removeAdmin" });
  await inProfile().findByRole("button", { name: "Make admin" });

  expect([promoted, await profileName(), rowOf("web-people-promote-human").textContent]).toStrictEqual([
    ["web-people-promote-humanadmin", "web-people-promote-humanadminHuman"],
    "web-people-promote-human",
    "web-people-promote-humanHuman",
  ]);

  close();
});

it("a refused admin change says why and leaves the tags as they were", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { answered, close } = await profileOpened({
    client: await adminOf("web-people-refused"),
    name: "web-people-refused-human",
  });
  await inProfile().findByRole("button", { name: "Make admin" });
  await adminClient().removeAdmin("web-people-refused-viewer");
  await adminClicked({ answered, button: "Make admin", method: "makeAdmin" });
  const alert = await inProfile().findByRole("alert");

  expect([alert.textContent, await profileName()]).toStrictEqual([
    "Couldn't change admin (admin_only): Only an admin identity can do this.",
    "web-people-refused-human",
  ]);

  close();
});
