import { adminClient, anonymousClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inPane, inProfile } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { createLoginApprovals } from "../../board/index.ts";
import { holdsCallsOpen } from "../../testing/web.ts";
import { openAt } from "./render.tsx";
import { profileOpened } from "./view-opened.ts";

interface Held {
  readonly client: CookoutClient;
  readonly release: () => void;
}

async function pressed(found: Promise<HTMLElement>): Promise<HTMLElement> {
  const button = await found;
  button.focus();
  fireEvent.click(button);
  await Promise.resolve();
  return button;
}

async function makeAdminHeld(): Promise<Held> {
  const viewer = await newIdentity({ kind: "human", name: "web-kept-focus-viewer" });
  await newIdentity({ kind: "human", name: "web-kept-focus-human" });
  await adminClient().makeAdmin("web-kept-focus-viewer");
  const sent = Promise.withResolvers<null>();
  holdsCallsOpen("makeAdmin");
  const client: CookoutClient = {
    ...viewer.client,
    makeAdmin: async (name) => {
      await sent.promise;
      const made = await viewer.client.makeAdmin(name);
      return made;
    },
  };
  return {
    client,
    release: () => {
      sent.resolve(null);
    },
  };
}

interface Shown {
  readonly card: HTMLElement;
  readonly close: () => void;
}

async function agentCardShown(): Promise<Shown> {
  const owner = await newIdentity({ kind: "human", name: "web-revoke-focus-owner" });
  const bot = await newIdentity({ kind: "agent", name: "web-revoke-focus-bot", owner: "web-revoke-focus-owner" });
  await bot.client.join({ as: "web-revoke-focus-bot", host: "laptop" });
  const close = openAt({ client: owner.client, hash: "#/settings/agents" });
  const card = await screen.findByRole("group", { name: "@web-revoke-focus-bot" });
  return { card, close };
}

it("make admin that loses focus while the change is sent takes it back once it is made", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { client, release } = await makeAdminHeld();
  const { close } = await profileOpened({ client, name: "web-kept-focus-human" });
  const make = await pressed(inProfile().findByRole("button", { name: "Make admin" }));
  await waitFor(() => {
    expect(make.hasAttribute("disabled")).toBe(true);
  });
  make.blur();
  release();
  const remove = await inProfile().findByRole("button", { name: "Remove admin" });

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(remove);
  });

  close();
});

it("revoking an agent's session puts focus on its Rotate token, as Revoke session is gone", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { card, close } = await agentCardShown();
  await pressed(within(card).findByRole("button", { name: "Revoke session" }));
  await pressed(inDialog().findByRole("button", { name: "Revoke session" }));
  await within(card).findByText("No live session");

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(within(card).getByRole("button", { name: "Rotate token" }));
  });

  close();
});

it("deleting an identity from its profile puts focus on the page's heading", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-delete-focus-bot" });
  const { close } = await profileOpened({ client: adminClient(), name: "web-delete-focus-bot" });
  await pressed(inProfile().findByRole("button", { name: "Delete" }));
  await pressed(inDialog().findByRole("button", { name: "Delete @web-delete-focus-bot" }));
  await waitFor(() => {
    expect(inProfile().queryByRole("button", { name: "Delete" })).toBeNull();
  });

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(inPane().getByRole("heading", { level: 1 }));
  });

  close();
});

it("close profile puts focus back on the person's row that opened it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const viewer = await newIdentity({ kind: "human", name: "web-close-focus-viewer" });
  const { close } = await profileOpened({
    client: viewer.client,
    name: "web-close-focus-viewer",
    waitingOn: ["listIdentities"],
  });
  fireEvent.click(await inProfile().findByRole("link", { name: "Close profile" }));
  globalThis.location.hash = "#/people";
  const people = await screen.findByRole("list", { name: "Identities" });

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(
      within(people).getByRole("link", { name: /^web-close-focus-viewer,/u }),
    );
  });

  close();
});

it("approving a login puts focus on the page's heading, as Approve is gone", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-focus" });
  const started = await anonymousClient().startLogin({ host: "focus-laptop" });
  const close = openAt({
    client: human.client,
    hash: `#/approve/${started.userCode}`,
    loginApprovals: createLoginApprovals(human.client),
  });
  await pressed(inPane().findByRole("button", { name: "Approve" }));
  await screen.findByText(/^Approved\./u);

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(
      inPane().getByRole("heading", { level: 1, name: "Approve a login" }),
    );
  });

  close();
});
