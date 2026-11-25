import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { heldBack } from "./slow-calls.ts";
import { openAt } from "./render.tsx";
import { profileOpened } from "./view-opened.ts";
import { screen } from "@testing-library/react";

const DELAY_MS = 1500;
const NO_DELAY = 0;

async function profileHeading(): Promise<string> {
  const heading = await screen.findByRole("heading", { level: 3 });
  return heading.textContent;
}

it("with no delay, the view's client is the client itself", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const client = adminClient();

  expect(heldBack({ client, delay: NO_DELAY })).toBe(client);
});

it("with calls delayed, a test that reads the profile without waiting fails, and one that waits passes", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "human", name: "web-slow-calls" });
  const unmount = openAt({
    client: heldBack({ client: adminClient(), delay: DELAY_MS }),
    hash: "#/people/web-slow-calls",
  });
  const missingItsWait = await profileHeading().catch(() => "not shown yet");
  unmount();
  const { close } = await profileOpened({
    client: heldBack({ client: adminClient(), delay: DELAY_MS }),
    name: "web-slow-calls",
  });
  const waited = await profileHeading();
  close();

  expect([missingItsWait, waited]).toStrictEqual(["not shown yet", "web-slow-calls"]);
});
