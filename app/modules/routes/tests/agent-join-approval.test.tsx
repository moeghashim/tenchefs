import { anonymousClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { StartAgentJoinRequest } from "../../sdk/index.ts";
import { alertSaying } from "./alerts.ts";
import { createAgentJoinApprovals } from "../../board/index.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

interface Opened {
  readonly close: () => void;
  readonly userCode: string;
  readonly requestId: Awaited<ReturnType<ReturnType<typeof anonymousClient>["startAgentJoin"]>>["requestId"];
  readonly expiresAt: string;
}

type Human = Awaited<ReturnType<typeof newIdentity>>;

async function ownerOf(name: string, agent: string): Promise<Human> {
  const human = await newIdentity({ kind: "human", name });
  await newIdentity({ kind: "agent", name: agent, owner: name });
  return human;
}

async function openedFor(human: Human, asked: StartAgentJoinRequest): Promise<Opened> {
  const started = await anonymousClient().startAgentJoin(asked);
  const close = openAt({
    agentJoinApprovals: createAgentJoinApprovals(human.client),
    client: human.client,
    hash: `#/approve-join/${started.userCode}`,
  });
  return { close, expiresAt: started.expiresAt, requestId: started.requestId, userCode: started.userCode };
}

async function shownTexts(): Promise<readonly unknown[]> {
  const code = await screen.findByLabelText("Code");
  return [
    code.textContent,
    screen.getByText(/asks to join from build-box/u).textContent,
    screen.getByText(/^Joins as /u).textContent,
    screen.getByLabelText<HTMLInputElement>(/^Idle expiry/u).value,
  ];
}

async function approvedLowered(): Promise<string | null> {
  fireEvent.change(screen.getByLabelText(/^Idle expiry/u), { target: { value: "7d" } });
  fireEvent.click(inPane().getByRole("button", { name: "Approve" }));
  const approved = await screen.findByText(/^Approved, /u);
  return approved.textContent;
}

it("the approval page shows the agent, host, code and asked expiry, and approves it lowered", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await ownerOf("web-join-ada", "web-join-triage");
  const opened = await openedFor(human, { as: "web-join-triage", host: "build-box", idleExpiry: "30d" });
  const shown = await shownTexts();
  const approved = await approvedLowered();
  const collected = await anonymousClient().collectAgentJoin(opened.requestId);
  opened.close();

  expect(shown).toStrictEqual([
    opened.userCode,
    `web-join-triage asks to join from build-box, until ${opened.expiresAt}.`,
    "Joins as web-join-triage, which you own.",
    "30d",
  ]);
  expect(approved).toMatch(/^Approved, with an idle expiry of 7d\./u);
  expect(collected).toMatchObject({
    agentSession: { created: false, identity: "web-join-triage" },
    status: "approved",
  });
});

async function refusedThenReplaced(): Promise<string | null> {
  await screen.findByText(/^Joins as web-join-live, which you own\./u);
  fireEvent.click(inPane().getByRole("button", { name: "Approve" }));
  const refused = await alertSaying("Couldn't approve");
  const refusedText = refused.textContent;
  fireEvent.click(screen.getByLabelText(/^Replace its live session/u));
  fireEvent.click(inPane().getByRole("button", { name: "Approve" }));
  await screen.findByText(/^Approved, /u);
  return refusedText;
}

it("for an agent with a live session, approving says so until the approver ticks replace", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-join-grace" });
  await human.client.join({ as: "web-join-live", displayName: "Live agent" });
  const opened = await openedFor(human, { as: "web-join-live", host: "build-box" });
  const refusedText = await refusedThenReplaced();
  opened.close();

  expect(refusedText).toMatch(/^Couldn't approve \(agent_session_live\)/u);
});

it("a user code with no live agent join request says why it can't be shown", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-join-gone" });
  const close = openAt({
    agentJoinApprovals: createAgentJoinApprovals(human.client),
    client: human.client,
    hash: "#/approve-join/ZZZZ-ZZZZ",
  });

  const alert = await alertSaying("Couldn't show this agent join request");

  expect(alert.textContent).toMatch(/^Couldn't show this agent join request \(agent_join_request_not_found\)/u);

  close();
});

it("an agent join request approved already shows as approved", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await ownerOf("web-join-done", "web-join-done-agent");
  const started = await anonymousClient().startAgentJoin({ as: "web-join-done-agent", host: "build-box" });
  await human.client.approveAgentJoin(started.userCode);
  const close = openAt({
    agentJoinApprovals: createAgentJoinApprovals(human.client),
    client: human.client,
    hash: `#/approve-join/${started.userCode}`,
  });

  const approved = await screen.findByText(/^Approved, /u);

  expect(approved.textContent).toMatch(/idle expiry of 7d/u);

  close();
});

async function dismissedTexts(): Promise<readonly (string | null)[]> {
  const live = await screen.findByText(/^web-join-dismissed is already joined in another session/u);
  fireEvent.click(inPane().getByRole("button", { name: "Dismiss" }));
  const dismissed = await screen.findByText(/^Dismissed\./u);
  return [live.textContent, dismissed.textContent];
}

it("for an agent already joined in another session, the approval page says so, and Dismiss clears the request", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-join-hopper" });
  await human.client.join({ as: "web-join-dismissed", displayName: "Dismissed agent" });
  const opened = await openedFor(human, { as: "web-join-dismissed", host: "build-box" });
  const texts = await dismissedTexts();
  const refused = await anonymousClient()
    .collectAgentJoin(opened.requestId)
    .catch((error: unknown) => error);
  opened.close();

  expect(texts).toStrictEqual([
    expect.stringContaining(
      "Tick Replace its live session to end that session and join this one, or Dismiss this request.",
    ),
    "Dismissed. The waiting join stops; you can close this page.",
  ]);
  expect(refused).toMatchObject({ code: "agent_join_request_denied" });
});

it("a Dismiss of a request approved meanwhile says why, and the page stays open", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await ownerOf("web-join-late", "web-join-late-agent");
  const opened = await openedFor(human, { as: "web-join-late-agent", host: "build-box" });
  await screen.findByText(/^Joins as web-join-late-agent/u);
  await human.client.approveAgentJoin(opened.userCode);
  fireEvent.click(inPane().getByRole("button", { name: "Dismiss" }));
  const refused = await alertSaying("Couldn't");
  opened.close();

  expect(refused.textContent).toMatch(/\(agent_join_request_not_found\)/u);
});
