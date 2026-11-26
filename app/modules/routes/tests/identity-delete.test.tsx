import { adminClient, newIdentity } from "./identities.ts";
import { expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { inDialog, inProfile } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import type { OpenedView } from "./view-opened.ts";
import { holdsCallsOpen } from "../../testing/web.ts";
import { profileOpened } from "./view-opened.ts";

async function listedNames(prefix: string): Promise<readonly string[]> {
  const { identities } = await adminClient().listIdentities({ include: "deactivated" });
  return identities.filter((each) => each.name.startsWith(prefix)).map((each) => each.name);
}

it("an admin sees Delete on the profile of an identity with no messages, and deleting it removes it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-delete-bot" });
  const { answered, close } = await profileOpened({ client: adminClient(), name: "web-delete-bot" });
  fireEvent.click(await inProfile().findByRole("button", { name: "Delete" }));
  fireEvent.click(await inDialog().findByRole("button", { name: "Delete @web-delete-bot" }));
  await answered("deleteIdentity");
  await inProfile().findByText("Unknown identity");

  await expect(listedNames("web-delete-bot")).resolves.toStrictEqual([]);

  close();
});

it("an admin sees Deactivate, not Delete, on the profile of an identity with messages", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const talker = await newIdentity({ kind: "agent", name: "web-delete-talker" });
  await talker.client.createChannel({ name: "web-delete-talk" });
  await talker.client.createMessage({ channel: "web-delete-talk", text: "hello" });
  const { close } = await profileOpened({ client: adminClient(), name: "web-delete-talker" });
  await inProfile().findByRole("button", { name: "Deactivate" });
  await waitFor(() => {
    expect(inProfile().queryByRole("button", { name: "Delete" })).toBeNull();
  });

  await expect(listedNames("web-delete-talker")).resolves.toStrictEqual(["web-delete-talker"]);

  close();
});

it("an admin sees Deactivate when the message count can't be read", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-delete-uncounted" });
  const countMessagesBy = vi.fn<CookoutClient["countMessagesBy"]>().mockRejectedValue(new Error("unreachable"));
  const client = { ...adminClient(), countMessagesBy };
  const { close } = await profileOpened({ client, name: "web-delete-uncounted" });
  await inProfile().findByRole("button", { name: "Deactivate" });
  await waitFor(() => {
    expect(countMessagesBy).toHaveBeenCalledWith("web-delete-uncounted");
  });

  expect(inProfile().queryByRole("button", { name: "Delete" })).toBeNull();

  close();
});

const NO_MESSAGES = 0;
const SOME_MESSAGES = 3;

function deferredCount(): {
  readonly countMessagesBy: CookoutClient["countMessagesBy"];
  readonly resolve: (messages: number) => void;
} {
  const { promise, resolve } = Promise.withResolvers<{ readonly messages: number }>();
  holdsCallsOpen("countMessagesBy");
  return {
    countMessagesBy: vi.fn<CookoutClient["countMessagesBy"]>().mockReturnValue(promise),
    resolve: (messages) => {
      resolve({ messages });
    },
  };
}

interface Counting {
  readonly answered: OpenedView["answered"];
  readonly count: ReturnType<typeof deferredCount>;
  readonly messages: number;
}

async function countAnswered({ answered, count, messages }: Counting): Promise<void> {
  count.resolve(messages);
  await answered("countMessagesBy");
}

function expectNothingClickable(): void {
  expect(inProfile().queryByRole("button", { name: "Delete" })).toBeNull();
  expect(inProfile().getByRole("button", { name: "Deactivate" })).toHaveProperty("disabled", true);
}

it("an admin can click neither Deactivate nor Delete while the message count loads, then sees Delete for 0", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-delete-pending-none" });
  const count = deferredCount();
  const { answered, close } = await profileOpened({
    client: { ...adminClient(), ...count },
    name: "web-delete-pending-none",
    waitingOn: ["listIdentities"],
  });
  await inProfile().findByRole("button", { name: "Deactivate" });
  expectNothingClickable();
  await countAnswered({ answered, count, messages: NO_MESSAGES });
  await inProfile().findByRole("button", { name: "Delete" });

  expect(inProfile().queryByRole("button", { name: "Deactivate" })).toBeNull();

  close();
});

it("an admin can click neither Deactivate nor Delete while the message count loads, then sees Deactivate for more", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "agent", name: "web-delete-pending-some" });
  const count = deferredCount();
  const { answered, close } = await profileOpened({
    client: { ...adminClient(), ...count },
    name: "web-delete-pending-some",
    waitingOn: ["listIdentities"],
  });
  await inProfile().findByRole("button", { name: "Deactivate" });
  expectNothingClickable();
  await countAnswered({ answered, count, messages: SOME_MESSAGES });
  await inProfile().findEnabledButton("Deactivate");

  expect(inProfile().queryByRole("button", { name: "Delete" })).toBeNull();

  close();
});
