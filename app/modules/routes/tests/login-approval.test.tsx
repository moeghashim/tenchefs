import { anonymousClient, newIdentity, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { alertSaying } from "./alerts.ts";
import { createLoginApprovals } from "../../board/index.ts";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const host = { host: "ada-laptop" };

async function shownThenApproved(): Promise<readonly unknown[]> {
  const code = await screen.findByLabelText("Code");
  const shown = [
    code.textContent,
    screen.getByText(/^Requested by ada-laptop/u).textContent,
    screen.queryByRole("navigation", { name: "Sidebar" }),
  ];
  fireEvent.click(inPane().getByRole("button", { name: "Approve" }));
  await screen.findByText(/^Approved\./u);
  return shown;
}

it("logged in, the approval page shows the code and host, and Approve lets the terminal collect", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-ada" });
  const started = await anonymousClient().startLogin(host);
  const close = openAt({
    client: human.client,
    hash: `#/approve/${started.userCode}`,
    loginApprovals: createLoginApprovals(human.client),
  });

  const shown = await shownThenApproved();
  const collected = await anonymousClient().collectLogin(started.requestId);
  close();

  expect(shown).toStrictEqual([started.userCode, `Requested by ada-laptop, until ${started.expiresAt}.`, null]);
  expect(collected).toMatchObject({ identity: { name: "web-approve-ada" }, status: "approved" });
});

it("logged out, the approval page asks for a login first, then shows the request", { timeout: 5000 }, async () => {
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
  const code = await screen.findByLabelText("Code");

  expect(code.textContent).toBe(started.userCode);

  close();
});

it("a user code with no live login request says why it can't be shown", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-gone" });
  const close = openAt({
    client: human.client,
    hash: "#/approve/ZZZZ-ZZZZ",
    loginApprovals: createLoginApprovals(human.client),
  });

  const alert = await alertSaying("Couldn't show this login");

  expect(alert.textContent).toMatch(/^Couldn't show this login \(login_request_not_found\)/u);

  close();
});

it("an approval link that isn't a user code shows nothing here", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await newIdentity({ kind: "human", name: "web-approve-bad-code" });
  const close = openAt({ client: human.client, hash: "#/approve/not-a-code" });

  await expect(screen.findByText("Nothing here")).resolves.toBeDefined();

  close();
});
