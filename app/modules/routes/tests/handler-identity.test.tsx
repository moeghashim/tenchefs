import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inProfile } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { addWebhookCommand } from "./webhook-commands.ts";
import { openAt } from "./render.tsx";
import { profileOpened } from "./view-opened.ts";

const ONE = 1;

async function rowTexts(filter: string): Promise<readonly string[]> {
  const list = await screen.findByRole("list", { name: "Identities" });
  fireEvent.change(screen.getByRole("textbox", { name: "Filter by name" }), { target: { value: filter } });
  return waitFor(() => {
    const texts: string[] = [];
    for (const row of within(list).getAllByRole("link")) {
      texts.push(row.textContent);
    }

    expect(texts).toHaveLength(ONE);

    return texts;
  });
}

async function withMessage(client: CookoutClient, channel: string): Promise<void> {
  await client.createChannel({ name: channel });
  await client.createMessage({ channel, text: "hello" });
}

it("a handler identity is labelled with its Webhook command on its People row and its profile", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await addWebhookCommand({ name: "web-handler-label" });
  const close = openAt({ client: adminClient(), hash: "#/people/web-handler-label" });

  await expect(rowTexts("web-handler-label")).resolves.toStrictEqual([
    expect.stringContaining("Handler for /web-handler-label"),
  ]);

  await inProfile().findByText("Handler for /web-handler-label");

  close();
});

it("deactivating a handler identity warns that its Webhook command stops replying, and still goes ahead", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await withMessage(await addWebhookCommand({ name: "web-handler-off" }), "web-handler-off");
  const { close } = await profileOpened({ client: adminClient(), name: "web-handler-off" });
  fireEvent.click(await inProfile().findEnabledButton("Deactivate"));
  await inDialog().findByText(
    "Its tokens and sessions stop working at once and it can't post; its messages stay. You can reactivate it later. /web-handler-off will stop replying until @web-handler-off is reactivated.",
  );
  fireEvent.click(inDialog().getByRole("button", { name: "Deactivate @web-handler-off" }));

  await waitFor(async () => {
    await expect(adminClient().getIdentity("web-handler-off")).resolves.toMatchObject({
      identity: { deactivated: true },
    });
  });

  close();
});

it("deleting a handler identity warns that its Webhook command goes with it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await addWebhookCommand({ name: "web-handler-gone" });
  const { close } = await profileOpened({ client: adminClient(), name: "web-handler-gone" });
  fireEvent.click(await inProfile().findByRole("button", { name: "Delete" }));

  await expect(
    inDialog().findByText(
      "It has no messages. Its tokens stop working and its name is free again. This can't be undone. /web-handler-gone is removed with it and stops replying.",
    ),
  ).resolves.toBeDefined();

  close();
});

it("deactivating an identity that handles no Webhook command gives no handler warning", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const plain = await newIdentity({ kind: "agent", name: "web-handler-none" });
  await withMessage(plain.client, "web-handler-none");
  const { close } = await profileOpened({ client: adminClient(), name: "web-handler-none" });
  fireEvent.click(await inProfile().findEnabledButton("Deactivate"));

  await expect(
    inDialog().findByText(
      "Its tokens and sessions stop working at once and it can't post; its messages stay. You can reactivate it later.",
    ),
  ).resolves.toBeDefined();

  close();
});
