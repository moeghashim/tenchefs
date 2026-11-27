import { expect, it, onTestFinished } from "vitest";
import { openedBy, profileDot } from "./presence.ts";
import { newIdentity } from "./identities.ts";

const WAKES = "Wakes on mention";

it("a runner-held agent shows Wakes on mention while asleep, and plain Online during a wake run", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const owner = await newIdentity({ kind: "human", name: "web-runner-owner" });
  const agent = await newIdentity({ kind: "agent", name: "web-runner-bot", owner: "web-runner-owner" });
  const events = await agent.client.watch({ runner: true });
  onTestFinished(events.close);
  await openedBy({ client: owner.client, hash: "#/people/web-runner-bot" });
  const asleep = await profileDot({ label: WAKES, who: "web-runner-bot" });
  await agent.client.startWakeRun();
  const running = await profileDot({ label: "Online", who: "web-runner-bot" });

  expect([asleep, running]).toStrictEqual([
    { presence: "online", tooltip: WAKES },
    { presence: "online", tooltip: "Online" },
  ]);
});
