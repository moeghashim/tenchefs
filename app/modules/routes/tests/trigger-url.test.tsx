import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { openedBy, profileDot } from "./presence.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { inProfile } from "./regions.ts";

const WAKES = "Wakes on mention";
const UNREACHABLE_URL = "http://127.0.0.1:1/fire";

interface Owned {
  readonly owner: CookoutClient;
  readonly bot: string;
}

async function ownedAgent(prefix: string): Promise<Owned> {
  const owner = await newIdentity({ kind: "human", name: `${prefix}-owner` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-owner` });
  return { bot: `${prefix}-bot`, owner: owner.client };
}

async function failedAgent(prefix: string): Promise<Owned> {
  const owned = await ownedAgent(prefix);
  await owned.owner.setTrigger(owned.bot, { token: "routine-secret", url: UNREACHABLE_URL });
  await adminClient().createChannel({ name: prefix });
  await adminClient().createMessage({ channel: prefix, text: `@${owned.bot} are you there?` });
  await waitFor(async () => {
    await expect(owned.owner.getTrigger(owned.bot)).resolves.toHaveProperty("trigger.lastResult.ok", false);
  });
  return owned;
}

function triggerForm(bot: string): HTMLElement {
  return inProfile().getByRole("form", { name: `Trigger URL for @${bot}` });
}

it("the owner sets a trigger URL with a write-only token on the agent's profile, and the agent wakes on mention", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { bot, owner } = await ownedAgent("web-trigger-set");
  await openedBy({ client: owner, hash: `#/people/${bot}` });
  await inProfile().findByText("No trigger URL: a mention calls nothing.");
  const form = triggerForm(bot);
  fireEvent.change(within(form).getByLabelText("Trigger URL", { exact: false }), {
    target: { value: "https://routines.example.com/fire" },
  });
  fireEvent.change(within(form).getByLabelText("Token (write-only: never shown again)"), {
    target: { value: "routine-secret" },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Save trigger URL" }));

  await expect(
    Promise.all([inProfile().findByText("Not called yet."), profileDot({ label: WAKES, who: bot })]),
  ).resolves.toStrictEqual([expect.anything(), { presence: "online", tooltip: WAKES }]);
  await expect(owner.getTrigger(bot)).resolves.toStrictEqual({
    trigger: { url: "https://routines.example.com/fire" },
  });
});

it("an agent whose trigger call fails shows Unreachable, and the owner's Clear takes the URL away", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { bot, owner } = await failedAgent("web-trigger-fail");
  await openedBy({ client: owner, hash: `#/people/${bot}` });
  const label = "Unreachable: the trigger URL couldn't be reached, just now";

  await expect(
    Promise.all([
      profileDot({ label, who: bot }),
      inProfile().findByText("Last call failed: the trigger URL couldn't be reached, just now"),
    ]),
  ).resolves.toStrictEqual([{ presence: "unreachable", tooltip: label }, expect.anything()]);

  fireEvent.click(within(triggerForm(bot)).getByRole("button", { name: "Clear" }));

  await expect(inProfile().findByText("No trigger URL: a mention calls nothing.")).resolves.toBeDefined();

  await waitFor(() => {
    expect(screen.queryByText("Unreachable", { exact: false })).toBeNull();
  });
});

function filledWithHeaders(bot: string): HTMLElement {
  const form = triggerForm(bot);
  fireEvent.change(within(form).getByLabelText("Trigger URL", { exact: false }), {
    target: { value: "https://routines.example.com/fire" },
  });
  fireEvent.change(within(form).getByLabelText("Token (write-only: never shown again)"), {
    target: { value: "routine-secret" },
  });
  const headers = within(form).getByLabelText("Extra headers (values write-only)", { exact: false });
  fireEvent.change(headers, { target: { value: "anthropic-version: 2023-06-01\nX-Key: header-secret\n" } });
  return headers;
}

it("the owner adds extra headers with the trigger URL, and the form shows only their names", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { bot, owner } = await ownedAgent("web-trigger-headers");
  await openedBy({ client: owner, hash: `#/people/${bot}` });
  await inProfile().findByText("No trigger URL: a mention calls nothing.");
  const headers = filledWithHeaders(bot);
  fireEvent.click(within(triggerForm(bot)).getByRole("button", { name: "Save trigger URL" }));

  await expect(inProfile().findByText("Sends headers: anthropic-version, x-key")).resolves.toBeDefined();
  expect(headers).toHaveProperty("value", "");
  expect(document.body.innerHTML).not.toContain("header-secret");
  await expect(owner.getTrigger(bot)).resolves.toStrictEqual({
    trigger: { headerNames: ["anthropic-version", "x-key"], url: "https://routines.example.com/fire" },
  });
});

function savedAgain(bot: string): void {
  const form = triggerForm(bot);
  fireEvent.change(within(form).getByLabelText("Token (write-only: never shown again)"), {
    target: { value: "routine-secret-2" },
  });
  fireEvent.change(within(form).getByLabelText("Extra headers (values write-only)", { exact: false }), {
    target: { value: "anthropic-beta: experimental" },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Save trigger URL" }));
}

it("saving again without editing the URL keeps it, and replaces every header", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, owner } = await ownedAgent("web-trigger-resave");
  const first = { url: "https://routines.example.com/fire" };
  await owner.setTrigger(bot, { ...first, headers: [{ name: "x-key", value: "one" }], token: "routine-secret" });
  await openedBy({ client: owner, hash: `#/people/${bot}` });
  await inProfile().findByText("Sends headers: x-key");
  savedAgain(bot);

  await expect(inProfile().findByText("Sends headers: anthropic-beta")).resolves.toBeDefined();
  await expect(owner.getTrigger(bot)).resolves.toStrictEqual({
    trigger: { ...first, headerNames: ["anthropic-beta"] },
  });
});

it("the last call line follows a call made while the trigger form is open", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, owner } = await ownedAgent("web-trigger-live");
  await owner.setTrigger(bot, { token: "routine-secret", url: UNREACHABLE_URL });
  await adminClient().createChannel({ name: "web-trigger-live" });
  await openedBy({ client: owner, hash: `#/people/${bot}` });
  await inProfile().findByText("Not called yet.");
  await adminClient().createMessage({ channel: "web-trigger-live", text: `@${bot} are you there?` });

  await expect(
    inProfile().findByText("Last call failed: the trigger URL couldn't be reached, just now"),
  ).resolves.toBeDefined();
});
