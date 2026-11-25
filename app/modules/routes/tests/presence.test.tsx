import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { agentNamed, authorDot, offline, online, profileDot, readerOn, rowDot } from "./presence.ts";
import { expect, it } from "vitest";
import { inProfile } from "./regions.ts";
import { openAt } from "./render.tsx";
import { scriptedLive } from "../../testing/web.ts";
import { within } from "@testing-library/react";

const SEEN = "Offline, last seen just now";
const NO_BADGE = 0;

it('an author who is watching shows an online dot, and going offline turns it into an offline ring read as "ada, Offline" (no last seen) with no reload', {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("web-presence-author-bot");
  await adminClient().createChannel({ name: "web-presence-author" });
  await agent.client.createMessage({ channel: "web-presence-author", text: "Beep from the bot" });
  const events = await agent.watch();
  await readerOn({ hash: "#/channels/web-presence-author", reader: "web-presence-author-reader" });

  await expect(
    authorDot({ at: "Beep from the bot", label: "Online", who: "web-presence-author-bot" }),
  ).resolves.toStrictEqual(online());

  await events.close();

  await expect(
    authorDot({ at: "Beep from the bot", label: "Offline", tooltip: SEEN, who: "web-presence-author-bot" }),
  ).resolves.toStrictEqual(offline(SEEN));
});

it("a People row and the profile show an online agent's dot, and the profile how it is connected", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("web-presence-host-bot");
  const { agentSessionToken } = await agent.client.join({ as: "web-presence-host-bot", host: "laptop-1" });
  await clientWith(agentSessionToken).watch();
  await readerOn({ hash: "#/people/web-presence-host-bot", reader: "web-presence-host-reader" });

  await expect(
    Promise.all([
      rowDot({ label: "Online", who: "web-presence-host-bot" }),
      profileDot({ label: "Online", who: "web-presence-host-bot" }),
      inProfile().findByText("Online · watching from laptop-1"),
    ]),
  ).resolves.toStrictEqual([online(), online(), expect.anything()]);
});

it("once an agent goes offline, its People row and profile show the ring and its profile when it was last seen", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("web-presence-seen-bot");
  const events = await agent.watch();
  await readerOn({ hash: "#/people/web-presence-seen-bot", reader: "web-presence-seen-reader" });
  await inProfile().findByText("Online · watching");
  await events.close();

  await expect(
    Promise.all([
      rowDot({ label: SEEN, who: "web-presence-seen-bot" }),
      profileDot({ label: SEEN, who: "web-presence-seen-bot" }),
      inProfile().findByText("Offline: connection lost · last seen just now"),
    ]),
  ).resolves.toStrictEqual([offline(SEEN), offline(SEEN), expect.anything()]);
});

it("the profile says why an agent went offline, from a presence event: offline: session revoked", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("web-presence-revoked-bot");
  const { agentSessionToken } = await agent.client.join({ as: "web-presence-revoked-bot" });
  await clientWith(agentSessionToken).watch();
  await readerOn({ hash: "#/people/web-presence-revoked-bot", reader: "web-presence-revoked-reader" });
  await inProfile().findByText("Online · watching");
  await adminClient().revokeAgentSession("web-presence-revoked-bot");

  await expect(inProfile().findByText("Offline: session revoked · last seen just now")).resolves.toBeDefined();
});

it("an agent never seen shows only that it is offline, its avatar has no badge, and its profile says it is an agent", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await agentNamed("web-presence-never-bot");
  await readerOn({ hash: "#/people/web-presence-never-bot", reader: "web-presence-never-reader" });

  await expect(profileDot({ label: "Offline", who: "web-presence-never-bot" })).resolves.toStrictEqual(offline());

  const avatar = within(inProfile().element()).getByTestId("avatar");

  expect([
    inProfile().getByText("Offline").textContent,
    avatar.dataset["agent"],
    avatar.childElementCount,
    inProfile().getByText(/^Agent · owned by admin$/u).textContent,
  ]).toStrictEqual(["Offline", "true", NO_BADGE, "Agent · owned by admin"]);
});

it("a presence change made while the live link was down shows once it is back", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const agent = await agentNamed("web-presence-missed-bot");
  const reader = await newIdentity({ kind: "human", name: "web-presence-missed-reader" });
  const { live, report } = scriptedLive();
  openAt({ client: reader.client, hash: "#/people", live });
  await rowDot({ label: "Offline", who: "web-presence-missed-bot" });

  report("down");
  await agent.watch();
  report("up");

  await expect(rowDot({ label: "Online", who: "web-presence-missed-bot" })).resolves.toStrictEqual(online());
});
