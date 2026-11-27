import { anonymousClient, newIdentity, sessionOf } from "./identities.ts";
import { createAgentJoinApprovals, createLoginApprovals } from "../../board/index.ts";
import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { alertSaying } from "./alerts.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const host = { host: "ada-laptop" };

async function emptyCodeField(): Promise<HTMLInputElement> {
  const field = await screen.findByLabelText<HTMLInputElement>("Code");
  return field;
}

function typeCode(code: string): void {
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: code } });
  fireEvent.click(inPane().getByRole("button", { name: "Show" }));
}

async function detailsShown(): Promise<readonly (string | null)[]> {
  const kind = await screen.findByText(/^Kind: /u);
  return [
    kind.textContent,
    screen.getByText(/^From: /u).textContent,
    screen.getByText(/^IP address: /u).textContent,
    screen.getByText(/^Started: /u).textContent,
  ];
}

async function detailsAfterTyping(code: string): Promise<readonly (string | null)[]> {
  await emptyCodeField();
  typeCode(code);
  const details = await detailsShown();
  return details;
}

async function approved(): Promise<void> {
  fireEvent.click(inPane().getByRole("button", { name: "Approve" }));
  await screen.findByText(/^Approved\./u);
}

interface OpenedLogin {
  readonly close: () => void;
  readonly started: Awaited<ReturnType<ReturnType<typeof anonymousClient>["startLogin"]>>;
}

async function openedWithCode(name: string): Promise<OpenedLogin> {
  const human = await newIdentity({ kind: "human", name });
  const started = await anonymousClient().startLogin(host);
  const close = openAt({
    client: human.client,
    hash: `#/approve/${started.userCode}`,
    loginApprovals: createLoginApprovals(human.client),
  });
  return { close, started };
}

it("a path holding a code opens an empty code field and shows no request", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await openedWithCode("web-approve-empty");
  const field = await emptyCodeField();
  const before = [field.value, inPane().queryByRole("button", { name: "Approve" }), screen.queryByText(/^Kind: /u)];
  close();

  expect(before).toStrictEqual(["", null, null]);
});

it("typing the code shows the request's details, and Approve approves it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, started } = await openedWithCode("web-approve-ada");
  const details = await detailsAfterTyping(started.userCode);
  await approved();
  const collected = await anonymousClient().collectLogin(started.requestId);
  close();

  expect(details).toStrictEqual([
    "Kind: terminal login",
    "From: ada-laptop",
    expect.stringMatching(/^IP address: \S+$/u),
    expect.stringMatching(/^Started: (?:just now|\d+ seconds ago)$/u),
  ]);
  expect(screen.queryByRole("navigation", { name: "Sidebar" })).toBeNull();
  expect(collected).toMatchObject({ identity: { name: "web-approve-ada" }, status: "approved" });
});

it("a code typed in lower case, without its dash, finds the request too", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-casual" });
  const started = await anonymousClient().startLogin(host);
  const close = openAt({ client: human.client, hash: "#/approve", loginApprovals: createLoginApprovals(human.client) });

  await emptyCodeField();
  typeCode(started.userCode.replace("-", "").toLowerCase());
  const shown = await screen.findByText(/^From: /u);

  expect(shown.textContent).toBe("From: ada-laptop");

  close();
});

it("logged out, the approval page asks for a login first, then opens the empty code field", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-later" });
  const started = await anonymousClient().startLogin(host);
  const close = openAt({
    client: human.client,
    hash: `#/approve/${started.userCode}`,
    loginApprovals: createLoginApprovals(human.client),
    session: sessionOf(anonymousClient()),
  });

  await screen.findByRole("form", { name: "Log in" });
  fireEvent.change(screen.getByLabelText("Token"), { target: { value: human.token } });
  fireEvent.click(inPane().getByRole("button", { name: "Log in" }));
  const field = await emptyCodeField();

  expect(field.value).toBe("");

  close();
});

it("a mistyped code says no request has it, and shows no Approve", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-gone" });
  const close = openAt({
    agentJoinApprovals: createAgentJoinApprovals(human.client),
    client: human.client,
    hash: "#/approve",
    loginApprovals: createLoginApprovals(human.client),
  });

  await emptyCodeField();
  typeCode("ZZZZ-ZZZZ");
  const alert = await alertSaying("No live request has the code ZZZZ-ZZZZ");

  expect(alert.textContent).toMatch(/Check it against the new device/u);
  expect(inPane().queryByRole("button", { name: "Approve" })).toBeNull();

  close();
});

it("text that isn't a code says what a code looks like, and shows no Approve", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-bad-code" });
  const close = openAt({ client: human.client, hash: "#/approve/not-a-code" });

  await emptyCodeField();
  typeCode("not-a-code");
  const alert = await alertSaying("not-a-code isn't a code");

  expect(alert.textContent).toBe("not-a-code isn't a code: a code looks like WDJB-MJHT.");
  expect(inPane().queryByRole("button", { name: "Approve" })).toBeNull();

  close();
});

async function openedAsAgent(): Promise<OpenedLogin> {
  await newIdentity({ kind: "human", name: "web-approve-owner" });
  const agent = await newIdentity({ kind: "agent", name: "web-approve-agent", owner: "web-approve-owner" });
  const started = await anonymousClient().startLogin(host);
  const close = openAt({ client: agent.client, hash: "#/approve", loginApprovals: createLoginApprovals(agent.client) });
  return { close, started };
}

it("for an agent, the approval page says it can't show a login request, and shows no Approve", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, started } = await openedAsAgent();
  await emptyCodeField();
  typeCode(started.userCode);
  const alert = await alertSaying("Couldn't show this login");

  expect(alert.textContent).toMatch(/^Couldn't show this login \(human_only\)/u);
  expect(inPane().queryByRole("button", { name: "Approve" })).toBeNull();

  close();
});
