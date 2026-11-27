import { anonymousClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inDialog, inSettings } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";
import { refusalOf } from "../../sdk/index.ts";

interface Devices {
  readonly human: CookoutClient;
  readonly laptop: string;
  readonly browser: string;
  readonly phone: string;
}

async function approvedLogin(approver: CookoutClient, host: string): Promise<string> {
  const started = await anonymousClient().startLogin({ host });
  await approver.approveLogin(started.userCode);
  const collected = await anonymousClient().collectLogin(started.requestId);
  if (collected.status === "approved") {
    return collected.token;
  }
  return expect.unreachable("The login was not approved.");
}

async function devicesOf(prefix: string): Promise<Devices> {
  const { client: human } = await newIdentity({ kind: "human", name: `${prefix}-human` });
  const laptop = await approvedLogin(human, `${prefix}-laptop`);
  const browser = await approvedLogin(clientWith(laptop), `${prefix}-browser`);
  const phone = await approvedLogin(clientWith(laptop), `${prefix}-phone`);
  return { browser, human, laptop, phone };
}

async function refusalWith(token: string): Promise<string> {
  try {
    await clientWith(token).whoami();
    return "accepted";
  } catch (error: unknown) {
    return refusalOf(error).code;
  }
}

async function openSessions(token: string): Promise<() => void> {
  const close = openAt({ client: clientWith(token), hash: "#/settings/session" });
  await inSettings().findByRole("heading", { level: 2, name: "Sessions" });
  return close;
}

async function sessionCard(where: string): Promise<HTMLElement> {
  const card = await inSettings().findByRole("group", { name: where });
  return card;
}

it("settings lists your sessions with kind, made, last used and what approved each, and marks This browser", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { browser } = await devicesOf("web-sessions-listed");
  const close = await openSessions(browser);
  const shown = await sessionCard("web-sessions-listed-browser");
  const laptop = await sessionCard("web-sessions-listed-laptop");

  expect([
    within(shown).getByText("This browser").textContent,
    within(laptop).queryByText("This browser"),
  ]).toStrictEqual(["This browser", null]);
  expect(within(shown).getByText(/^Terminal · made /u).textContent).toMatch(
    /^Terminal · made .+ · last used .+ · approved by web-sessions-listed-laptop$/u,
  );
  expect(within(laptop).getByText(/^Terminal · made /u).textContent).toMatch(/^Terminal · made .+ · last used .+$/u);

  close();
});

it("revoke on another session asks first, then ends it, and the list shows it gone", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { browser, phone } = await devicesOf("web-sessions-revoke");
  const close = await openSessions(browser);
  const ownPhone = await sessionCard("web-sessions-revoke-phone");
  fireEvent.click(within(ownPhone).getByRole("button", { name: "Revoke" }));
  const question = await inDialog().findByRole("heading", { name: "Revoke web-sessions-revoke-phone?" });
  fireEvent.click(inDialog().getByRole("button", { name: "Revoke" }));
  await waitFor(() => {
    expect(inSettings().queryByRole("group", { name: "web-sessions-revoke-phone" })).toBeNull();
  });

  expect([question.textContent, await refusalWith(phone), await refusalWith(browser)]).toStrictEqual([
    "Revoke web-sessions-revoke-phone?",
    "token_unknown",
    "accepted",
  ]);

  close();
});

function groupsNamed(prefix: string): readonly (string | null)[] {
  const names: (string | null)[] = [];
  for (const group of screen.getAllByRole("group", { name: (name) => name.startsWith(prefix) })) {
    names.push(group.getAttribute("aria-label"));
  }
  return names;
}

async function withAgentSession(prefix: string): Promise<Devices & { readonly agentSession: string }> {
  const devices = await devicesOf(prefix);
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  const { agentSessionToken } = await clientWith(devices.laptop).join({ as: `${prefix}-bot` });
  return { ...devices, agentSession: agentSessionToken };
}

it("log out everywhere says what will end, and after confirming only this browser is still logged in", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { agentSession, browser, laptop, phone } = await withAgentSession("web-sessions-everywhere");
  const close = await openSessions(browser);
  fireEvent.click(await inSettings().findByRole("button", { name: "Log out everywhere" }));
  const body = await inDialog().findByText(/will end/u);
  fireEvent.click(inDialog().getByRole("button", { name: "Log out everywhere" }));
  await waitFor(() => {
    expect(inSettings().queryByRole("group", { name: "web-sessions-everywhere-laptop" })).toBeNull();
  });

  expect([
    body.textContent,
    await refusalWith(laptop),
    await refusalWith(phone),
    await refusalWith(agentSession),
    await refusalWith(browser),
    groupsNamed("web-sessions-everywhere-"),
  ]).toStrictEqual([
    "2 sessions and 1 agent session will end. This browser stays logged in.",
    "token_unknown",
    "token_unknown",
    "agent_session_revoked",
    "accepted",
    ["web-sessions-everywhere-browser"],
  ]);

  close();
});

it("revoke on this browser logs it out", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { browser } = await devicesOf("web-sessions-own");
  const close = await openSessions(browser);
  const own = await sessionCard("web-sessions-own-browser");
  fireEvent.click(within(own).getByRole("button", { name: "Revoke" }));
  const form = await screen.findByRole("form", { name: "Log in" });

  expect(form.getAttribute("aria-label")).toBe("Log in");

  close();
});

it("a Log out everywhere preview that can't be answered says why, with no dialog", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { browser } = await devicesOf("web-sessions-unanswered");
  const refusing = {
    ...clientWith(browser),
    previewLogOutEverywhere: async (): Promise<never> => {
      await Promise.resolve();
      throw new Error("board unavailable");
    },
  };
  const close = openAt({ client: refusing, hash: "#/settings/session" });
  fireEvent.click(await inSettings().findByRole("button", { name: "Log out everywhere" }));
  const alert = await inSettings().findByRole("alert");

  expect([alert.textContent, screen.queryByRole("alertdialog")]).toStrictEqual([
    "Couldn't do that. Error: board unavailable",
    null,
  ]);

  close();
});

it("with nothing else logged in, Log out everywhere says so", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { token } = await newIdentity({ kind: "human", name: "web-sessions-alone" });
  const close = await openSessions(token);
  fireEvent.click(await inSettings().findByRole("button", { name: "Log out everywhere" }));
  const body = await inDialog().findByText(/stays logged in/u);

  expect(body.textContent).toBe("Nothing else is logged in. This browser stays logged in.");

  close();
});
