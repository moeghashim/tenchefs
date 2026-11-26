import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inDialog, inProfile } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import type { OpenedView } from "./view-opened.ts";
import { holdsCallsOpen } from "../../testing/web.ts";
import { profileOpened } from "./view-opened.ts";

interface Held {
  readonly client: CookoutClient;
  readonly release: () => void;
}

function heldDeactivation(client: CookoutClient): Held {
  const { promise, resolve } = Promise.withResolvers<null>();
  holdsCallsOpen("deactivateIdentity");
  return {
    client: {
      ...client,
      deactivateIdentity: async (name) => {
        await promise;
        const answer = await client.deactivateIdentity(name);
        return answer;
      },
    },
    release: () => {
      resolve(null);
    },
  };
}

async function deactivated(name: string): Promise<boolean> {
  const { identities } = await adminClient().listIdentities({ include: "deactivated" });
  return identities.some((each) => each.name === name && each.deactivated === true);
}

async function undeletableAgent(name: string): Promise<void> {
  const { client } = await newIdentity({ kind: "agent", name });
  await client.createChannel({ name });
  await client.createMessage({ channel: name, text: "hello" });
}

async function askingToDeactivate(name: string, client: CookoutClient): Promise<OpenedView> {
  await undeletableAgent(name);
  const opened = await profileOpened({ client, name });
  fireEvent.click(await inProfile().findEnabledButton("Deactivate"));
  await screen.findByRole("alertdialog", { name: `Deactivate @${name}?` });
  return opened;
}

async function pressInDialog(name: string): Promise<void> {
  fireEvent.click(await inDialog().findByRole("button", { name }));
}

async function dialogClosed(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
}

async function escapeWhilePending(): Promise<readonly boolean[]> {
  await inDialog().findByRole("button", { name: "Working…" });
  fireEvent.keyDown(inDialog().element(), { key: "Escape" });
  const disabled: boolean[] = [];
  for (const button of inDialog().getAllByRole("button")) {
    disabled.push(button.hasAttribute("disabled"));
  }
  return disabled;
}

it("deactivate asks in a dialog that says what happens, and Escape closes it with the identity still active", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close } = await askingToDeactivate("web-confirm-escape", adminClient());
  const body = screen.getByText(/can't post/u).textContent;
  fireEvent.keyDown(inDialog().element(), { key: "Escape" });
  await dialogClosed();

  expect([body, await deactivated("web-confirm-escape")]).toStrictEqual([
    "Its tokens and sessions stop working at once and it can't post; its messages stay. You can reactivate it later.",
    false,
  ]);

  close();
});

it("a confirmed action shows as pending, Escape can't close it, and it closes once the action finishes", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const held = heldDeactivation(adminClient());
  const { answered, close } = await askingToDeactivate("web-confirm-pending", held.client);
  await pressInDialog("Deactivate @web-confirm-pending");
  const disabled = await escapeWhilePending();
  held.release();
  await answered("deactivateIdentity");
  await inProfile().findByRole("button", { name: "Reactivate" });

  expect([disabled, screen.queryByRole("alertdialog"), await deactivated("web-confirm-pending")]).toStrictEqual([
    [true, true],
    null,
    true,
  ]);

  close();
});

it("a refused action keeps the dialog open with the reason inline, and Cancel closes it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const refusing: CookoutClient = {
    ...adminClient(),
    deactivateIdentity: async () => {
      await Promise.resolve();
      throw new Error("offline");
    },
  };
  const { answered, close } = await askingToDeactivate("web-confirm-refused", refusing);
  await pressInDialog("Deactivate @web-confirm-refused");
  await answered("deactivateIdentity");
  const { textContent: said } = await inDialog().findByRole("alert");
  await pressInDialog("Cancel");
  await dialogClosed();

  expect([said, inProfile().queryByRole("alert")]).toStrictEqual([
    expect.stringMatching(/^Couldn't deactivate \(.+\): /u),
    null,
  ]);

  close();
});

it("deleting asks in a destructive dialog that says it can't be undone", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-confirm-delete" });
  const { close } = await profileOpened({ client: adminClient(), name: "web-confirm-delete" });
  fireEvent.click(await inProfile().findByRole("button", { name: "Delete" }));
  await screen.findByRole("alertdialog", { name: "Delete @web-confirm-delete?" });

  expect([
    screen.getByText(/can't be undone/u).textContent,
    inDialog().getByRole("button", { name: "Delete @web-confirm-delete" }).dataset["tone"],
  ]).toStrictEqual([
    "It has no messages. Its tokens stop working and its name is free again. This can't be undone.",
    "destructive",
  ]);

  close();
});
