import type { CookoutClient } from "../../app/modules/sdk/index.ts";
import { createCookoutClient } from "../../app/modules/sdk/index.ts";
import { dropWatch } from "./dropped-watch.ts";
import { setTimeout as sleep } from "node:timers/promises";

interface Owner {
  readonly url: string;
  readonly ownerToken: string;
}

interface Presences extends Owner {
  readonly adminToken: string;
  readonly dropped: string;
  readonly droppedToken: string;
}

const WAKING_AGENT = "release-bot";
const UNREACHABLE_AGENT = "rollback";
const WAKING_URL = "https://routines.example.com/release-bot";
const UNREACHABLE_URL = "https://127.0.0.1:1/rollback";
const POLL_MS = 50;
const TRIES = 100;
const ONE = 1;
const NONE = 0;

async function untilCalled(owner: CookoutClient, tries: number): Promise<void> {
  const { trigger } = await owner.getTrigger(UNREACHABLE_AGENT);
  if (trigger !== null && typeof trigger.lastResult === "object") {
    return;
  }
  if (tries <= NONE) {
    throw new Error(`${UNREACHABLE_AGENT}'s trigger URL was never called`);
  }
  await sleep(POLL_MS);
  await untilCalled(owner, tries - ONE);
}

async function setScreenTriggers({ ownerToken, url }: Owner): Promise<void> {
  const owner = createCookoutClient({ env: {}, token: ownerToken, url });
  await owner.setTrigger(WAKING_AGENT, { token: "screenshot-token", url: WAKING_URL });
  await owner.setTrigger(UNREACHABLE_AGENT, { token: "screenshot-token", url: UNREACHABLE_URL });
  await owner.createMessage({ channel: "general", text: `@${UNREACHABLE_AGENT} are you there?` });
  await untilCalled(owner, TRIES);
}

export async function setScreenPresences(presences: Presences): Promise<void> {
  const { adminToken, url } = presences;
  await dropWatch({ adminToken, agent: presences.dropped, agentToken: presences.droppedToken, url });
  await setScreenTriggers(presences);
}
