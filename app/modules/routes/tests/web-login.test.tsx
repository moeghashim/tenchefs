import { adminClient, anonymousClient, newIdentity, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inPane, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { CookoutError } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";

const APPROVE = "💻 Approve from another device";
const USER_CODE = /[A-Z0-9]{4}-[A-Z0-9]{4}/u;
const POLLED = { timeout: 5000 };

function chooseApprove(): void {
  fireEvent.click(inPane().getByRole("button", { name: APPROVE }));
}

function shownCode(): string {
  return screen.getByLabelText("Code").textContent;
}

interface Opened {
  readonly close: () => void;
  readonly human: Awaited<ReturnType<typeof newIdentity>>;
}

async function openBesideHuman(name: string): Promise<Opened> {
  await adminClient().createChannel({ name });
  const human = await newIdentity({ kind: "human", name });
  const close = openAt({ client: human.client, hash: "#/", session: sessionOf(anonymousClient()) });
  await inPane().findByRole("button", { name: APPROVE });
  return { close, human };
}

async function channelLinkShown(name: string): Promise<string | null> {
  const link = await waitFor(() => inSidebar().getByRole("link", { name: `#${name}` }), POLLED);
  return link.getAttribute("href");
}

async function waitingShown(): Promise<readonly string[]> {
  chooseApprove();
  const { textContent: where } = await inPane().findByText(/on a logged-in device/u);
  const { textContent: lasts } = inPane().getByText(/^The code lasts until /u);
  return [where, lasts];
}

it("choosing Approve from another device shows a code, and approving it from a logged-in client logs the page in without a reload", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const { close, human } = await openBesideHuman("web-login-approved");
  const [where, lasts] = await waitingShown();
  await human.client.approveLogin(shownCode());
  const href = await channelLinkShown("web-login-approved");

  expect(where).toMatch(/\/#\/approve on a logged-in device, or run `cookout login approve [A-Z0-9-]{9}`/u);
  expect(lasts).toMatch(/^The code lasts until \d{4}-\d{2}-\d{2}T/u);
  expect(href).toBe("#/channels/web-login-approved");

  close();
});

function expiringClient(): CookoutClient {
  const gone = new CookoutError({
    code: "login_request_not_found",
    message: "No live login request has that ID.",
    status: 404,
  });
  return {
    ...anonymousClient(),
    collectWebLogin: async () => {
      await Promise.resolve();
      throw gone;
    },
  };
}

it("a web login request that expires says so and offers to start again", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: anonymousClient(), hash: "#/", session: sessionOf(expiringClient()) });
  await inPane().findByRole("button", { name: APPROVE });

  chooseApprove();
  const said = await waitFor(() => inPane().getByText(/^That code expired/u), POLLED);
  fireEvent.click(inPane().getByRole("button", { name: "Start again" }));
  const again = await screen.findByLabelText("Code");

  expect(said.textContent).toBe("That code expired before anyone approved it.");
  expect(again.textContent).toMatch(USER_CODE);

  close();
});

async function backToCards(): Promise<HTMLElement> {
  await waitingShown();
  fireEvent.click(inPane().getByRole("button", { name: "Back" }));
  await inPane().findByRole("button", { name: APPROVE });
  return inPane().getByText(/^Got a login link/u);
}

function logInWith(token: string): void {
  fireEvent.change(screen.getByLabelText("Token"), { target: { value: token } });
  fireEvent.click(inPane().getByRole("button", { name: "Log in" }));
}

it("going back from the waiting view returns to the cards, and the token card still logs in", {
  timeout: 8000,
}, async () => {
  expect.hasAssertions();

  const { close, human } = await openBesideHuman("web-login-token-card");
  const { textContent: line } = await backToCards();
  logInWith(human.token);
  const href = await channelLinkShown("web-login-token-card");

  expect(line).toBe("Got a login link from an admin? Just open it.");
  expect(href).toBe("#/channels/web-login-token-card");

  close();
});
