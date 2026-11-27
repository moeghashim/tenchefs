import { createTestAgent, testClient } from "../../../testing/index.ts";
import { test as base } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";
import { walk } from "./walk.ts";

const test = base.extend(probeFixtures);

const LOGIN_APPROVED = "Approved. Your terminal finishes logging in now; you can close this page.";
const JOIN_APPROVED = "Approved, with an idle expiry of 7d. The box finishes joining now; you can close this page.";

test("logging in by keyboard alone: the Token field has focus, and Enter logs in and lands on the page's heading", async ({
  page,
}) => {
  const { token } = await newIdentity({ kind: "human", name: unique("browser-walk-login") });
  await page.goto("/");
  const field = page.getByLabel("Token", { exact: true });
  await field.focus();
  await walk({
    page,
    steps: [
      { focused: field, keys: token, typed: true },
      { focused: inPane(page).getByRole("heading", { level: 1 }), keys: "Enter" },
    ],
  });
});

test("approving a Login request by keyboard alone: Enter on Approve approves it and lands on the page's heading", async ({
  baseURL,
  page,
}) => {
  const { token } = await newIdentity({ kind: "human", name: unique("browser-walk-approve") });
  const started = await testClient({ env: {}, url: baseURL ?? "" }).startLogin({ host: "walk-laptop" });
  await logIn({ page, token, url: `/#/approve/${started.userCode}` });
  await inPane(page).getByRole("button", { exact: true, name: "Approve" }).focus();
  await walk({
    page,
    steps: [
      {
        focused: inPane(page).getByRole("heading", { exact: true, level: 1, name: "Approve a login" }),
        keys: "Enter",
        shows: [inPane(page).getByText(LOGIN_APPROVED, { exact: true })],
      },
    ],
  });
});

test("approving an Agent join request by keyboard alone: the idle expiry, then Tab to Approve, landing on the page's heading", async ({
  baseURL,
  page,
}) => {
  const owner = unique("browser-walk-join");
  const human = await newIdentity({ kind: "human", name: owner });
  await createTestAgent({ by: human.client, name: `${owner}-agent` });
  const anonymous = testClient({ env: {}, url: baseURL ?? "" });
  const started = await anonymous.startAgentJoin({ as: `${owner}-agent`, host: "walk-box" });
  await logIn({ page, token: human.token, url: `/#/approve-join/${started.userCode}` });
  const expiry = inPane(page).getByRole("textbox", { exact: true, name: "Idle expiry" });
  await expiry.focus();
  await walk({
    page,
    steps: [
      { focused: expiry, keys: "ControlOrMeta+a" },
      { focused: expiry, keys: "7d", typed: true },
      { focused: inPane(page).getByRole("button", { exact: true, name: "Approve" }), keys: "Tab" },
      {
        focused: inPane(page).getByRole("heading", { exact: true, level: 1, name: "Approve an agent join" }),
        keys: "Enter",
        shows: [inPane(page).getByText(JOIN_APPROVED, { exact: true })],
      },
    ],
  });
});
