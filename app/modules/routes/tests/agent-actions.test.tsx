import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, onTestFinished, vi } from "vitest";
import { inDialog, inSettings, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Mock } from "vitest";
import { alertSaying } from "./alerts.ts";
import { openAt } from "./render.tsx";
import { refusalOf } from "../../sdk/index.ts";

interface Crew {
  readonly human: CookoutClient;
  readonly bot: CookoutClient;
}

async function crewOf(prefix: string): Promise<Crew> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  const bot = await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  return { bot: bot.client, human: human.client };
}

async function openSettings(client: CookoutClient): Promise<() => void> {
  const close = openAt({ client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
  await inSettings().findByRole("heading", { level: 2, name: "My agents" });
  return close;
}

async function agentCard(name: string): Promise<HTMLElement> {
  const card = await screen.findByRole("group", { name: `@${name}` });
  return card;
}

async function press(name: string, button: string): Promise<void> {
  fireEvent.click(within(await agentCard(name)).getByRole("button", { name: button }));
}

async function confirmWith(button: string): Promise<void> {
  fireEvent.click(await inDialog().findByRole("button", { name: button }));
}

async function pressAndAnswer(name: string, button: string, answer: string): Promise<void> {
  await press(name, button);
  await confirmWith(answer);
}

async function shownToken(name: string): Promise<string> {
  const token = await within(await agentCard(name)).findByLabelText("New Identity token");
  return token.textContent;
}

async function refusalWith(client: CookoutClient): Promise<string> {
  try {
    await client.whoami();
    return "accepted";
  } catch (error: unknown) {
    return refusalOf(error).code;
  }
}

async function joinedSession(bot: CookoutClient, name: string): Promise<CookoutClient> {
  const { agentSessionToken } = await bot.join({ as: name, host: "laptop" });
  const session = clientWith(agentSessionToken);
  await session.whoami();
  return session;
}

async function nameWith(token: string): Promise<string> {
  const { identity } = await clientWith(token).whoami();
  return identity.name;
}

async function rotateIn(name: string): Promise<string> {
  await press(name, "Rotate token");
  await confirmWith("Rotate token");
  const token = await shownToken(name);
  return token;
}

async function profileAs(client: CookoutClient, name: string): Promise<HTMLElement> {
  openAt({ client, hash: `#/people/${name}` });
  const panel = await screen.findByRole("complementary", { name: "Profile" });
  return panel;
}

function stubClipboard(): Mock<(text: string) => Promise<void>> {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText } });
  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, "clipboard");
  });
  return writeText;
}

async function submitIn(label: string, text: string): Promise<void> {
  const form = await screen.findByRole("form", { name: label });
  fireEvent.change(within(form).getByRole("textbox"), { target: { value: text } });
  fireEvent.click(within(form).getByRole("button"));
}

async function createAgentIn(name: string, displayName: string): Promise<void> {
  const form = await screen.findByRole("form", { name: "Create an agent" });
  fireEvent.change(within(form).getByRole("textbox", { name: "New agent's name" }), { target: { value: name } });
  fireEvent.change(within(form).getByRole("textbox", { name: /^Its display name/u }), {
    target: { value: displayName },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Create" }));
}

async function transferTo(name: string, owner: string): Promise<void> {
  await submitIn(`Transfer @${name}`, owner);
  await confirmWith(`Transfer to @${owner}`);
}

it("settings lists your agents with their live session, and Revoke ends it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, human } = await crewOf("web-mine-session");
  const session = await joinedSession(bot, "web-mine-session-bot");
  const close = await openSettings(human);
  const card = await agentCard("web-mine-session-bot");
  const { textContent: before } = await within(card).findByText(/^Joined from laptop/u);
  await pressAndAnswer("web-mine-session-bot", "Revoke session", "Revoke session");
  await within(card).findByText("No live session");

  expect([before, await refusalWith(session)]).toStrictEqual([
    expect.stringMatching(/^Joined from laptop · last used .+ · expires .+/u),
    "agent_session_revoked",
  ]);

  close();
});

it("rotate shows the new token once, and the old one is refused", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, human } = await crewOf("web-mine-rotate");
  const close = await openSettings(human);
  const token = await rotateIn("web-mine-rotate-bot");
  const card = await agentCard("web-mine-rotate-bot");
  const warning = within(card).getByText(/old token stops working/u).textContent;
  fireEvent.click(within(card).getByRole("button", { name: "Done" }));

  expect([
    await refusalWith(bot),
    await nameWith(token),
    warning,
    within(card).queryByLabelText("New Identity token"),
  ]).toStrictEqual([
    "token_revoked",
    "web-mine-rotate-bot",
    "Copy it now: it isn't shown again, and the old token stops working.",
    null,
  ]);

  close();
});

it("create makes an agent you own, with its display name, and shows its token once; a taken name is refused inline", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-mine-create");
  const close = await openSettings(human);
  await createAgentIn("web-mine-create-new", " New bot ");
  const token = await shownToken("web-mine-create-new");
  const { identity } = await clientWith(token).whoami();
  await createAgentIn("web-mine-create-bot", "Taken bot");
  const alert = await alertSaying("Couldn't create the agent (identity_exists)");

  expect([identity, screen.getByRole("form", { name: "Create an agent" }).contains(alert)]).toStrictEqual([
    expect.objectContaining({ displayName: "New bot", kind: "agent", owner: "web-mine-create-human" }),
    true,
  ]);

  close();
});

it("deactivate asks first, naming the agent, then marks it deactivated", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, human } = await crewOf("web-mine-off");
  const close = await openSettings(human);
  const card = await agentCard("web-mine-off-bot");
  await press("web-mine-off-bot", "Deactivate");
  const refusalBefore = await refusalWith(bot);
  await confirmWith("Deactivate @web-mine-off-bot");
  await within(card).findByRole("button", { name: "Reactivate" });

  expect([refusalBefore, await refusalWith(bot), within(card).getByText("(deactivated)").textContent]).toStrictEqual([
    "accepted",
    "token_revoked",
    "(deactivated)",
  ]);

  close();
});

it("an admin transfers an agent from its profile, and its owner shows at once", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await crewOf("web-mine-move");
  await newIdentity({ kind: "human", name: "web-mine-move-grace" });
  const panel = await profileAs(adminClient(), "web-mine-move-bot");
  await transferTo("web-mine-move-bot", "web-mine-move-grace");
  await within(panel).findByText("Agent · owned by web-mine-move-grace");
  await transferTo("web-mine-move-bot", "nobody-here");
  const alert = await alertSaying("Couldn't transfer");

  expect(inDialog().element().contains(alert)).toBe(true);
});

it("on a profile, the owner gets the agent's actions without Transfer, and others get none", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-mine-who");
  const other = await newIdentity({ kind: "human", name: "web-mine-who-other" });
  const ownerPanel = await profileAs(human, "web-mine-who-bot");
  await within(ownerPanel).findByRole("button", { name: "Rotate token" });
  const ownerForms = within(ownerPanel).queryAllByRole("form", { name: /^Transfer/u });
  cleanup();
  const otherPanel = await profileAs(other.client, "web-mine-who-bot");
  await within(otherPanel).findByText(/owned by web-mine-who-human/u);

  await waitFor(() => {
    expect([ownerForms, within(otherPanel).queryAllByRole("button")]).toStrictEqual([[], []]);
  });
});

it("copy token puts the new token on the clipboard", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { human } = await crewOf("web-mine-copy");
  const close = await openSettings(human);
  const token = await rotateIn("web-mine-copy-bot");
  await press("web-mine-copy-bot", "Copy token");

  expect(writeText).toHaveBeenCalledWith(token);

  close();
});

it("a session not yet used shows when it joined, and Cancel keeps the agent active", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, human } = await crewOf("web-mine-cancel");
  await bot.join({ as: "web-mine-cancel-bot" });
  const close = await openSettings(human);
  const card = await agentCard("web-mine-cancel-bot");
  const { textContent: line } = await within(card).findByText(/^Joined/u);
  await pressAndAnswer("web-mine-cancel-bot", "Deactivate", "Cancel");
  await within(card).findByRole("button", { name: "Deactivate" });

  expect([line, screen.queryByRole("alertdialog"), await refusalWith(bot)]).toStrictEqual([
    expect.stringMatching(/^Joined · not used yet · expires .+/u),
    null,
    "accepted",
  ]);

  close();
});

it("a session list the server refuses shows no session and no Revoke", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-mine-unlisted");
  const refusing: CookoutClient = {
    ...human,
    listAgentSessions: async () => {
      await Promise.resolve();
      throw new Error("offline");
    },
  };
  const close = await openSettings(refusing);
  const card = await agentCard("web-mine-unlisted-bot");
  await within(card).findByRole("button", { name: "Rotate token" });

  expect([
    within(card).queryByText(/session/u),
    within(card).queryByRole("button", { name: "Revoke session" }),
  ]).toStrictEqual([null, null]);

  close();
});
