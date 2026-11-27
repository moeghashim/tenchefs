import type { ClockFixtures, ClockOptions, OwnCookout } from "./clock.ts";
import { test as base, expect } from "@playwright/test";
import { createTestAgent, testClient } from "../../../testing/index.ts";
import type { Person } from "./people.ts";
import { clockFixtures } from "./clock.ts";
import { inPane } from "./regions.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures).extend<ClockFixtures & ClockOptions>(clockFixtures);

const NONE = 0;
const MINUTES_PER_DAY = 1440;
const MOVED_MINUTES = 2;
const TWO_MINUTES = MOVED_MINUTES / MINUTES_PER_DAY;

interface Agents {
  readonly owner: Person;
  readonly worker: string;
  readonly helper: string;
}

async function workerBroughtIn(cookout: OwnCookout): Promise<Agents> {
  const ownerName = unique("browser-brought-in");
  const owner = await cookout.newIdentity({ kind: "human", name: ownerName });
  const { token: chiefToken } = await createTestAgent({ by: owner.client, name: `${ownerName}-chief` });
  const chief = testClient({ token: chiefToken, url: cookout.webUrl });
  const agents = { helper: `${ownerName}-helper`, owner, worker: `${ownerName}-worker` };
  await createTestAgent({ broughtIn: true, by: chief, name: agents.worker });
  await createTestAgent({ by: owner.client, name: agents.helper });
  return agents;
}

async function askedTwoMinutesApart(cookout: OwnCookout, [first, second]: readonly [string, string]): Promise<void> {
  const anonymous = testClient({ env: {}, url: cookout.webUrl });
  await anonymous.startAgentJoin({ as: first, host: "build-box" });
  await cookout.daysPass(TWO_MINUTES);
  await anonymous.startAgentJoin({ as: second, host: "build-box" });
}

test("the approval list shows a join request for an agent another agent brought in only after 3 minutes", async ({
  ownCookout,
  page,
}) => {
  const { helper, owner, worker } = await workerBroughtIn(ownCookout);
  await logInWithStream({ page, token: owner.token, url: "/#/inbox" });
  const forYou = inPane(page).getByRole("list", { exact: true, name: "For you" });
  const workerRow = forYou.getByText(`@${worker} asks to join from build-box.`, { exact: true });

  await askedTwoMinutesApart(ownCookout, [worker, helper]);

  await expect(forYou.getByText(`@${helper} asks to join from build-box.`, { exact: true })).toBeVisible();
  await expect(workerRow).toHaveCount(NONE);

  await ownCookout.daysPass(TWO_MINUTES);

  await expect(workerRow).toBeVisible();
});
