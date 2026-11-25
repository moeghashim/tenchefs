import { test as base, expect } from "@playwright/test";
import { createTestAgent, testClient } from "../../../testing/index.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { inPane } from "./regions.ts";
import { logIn } from "./login.ts";
import { newIdentity } from "./people.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NONE = 0;

interface Asking {
  readonly baseURL: string | undefined;
  readonly page: Page;
}

interface Asked {
  readonly agent: string;
  readonly anonymous: CookoutClient;
  readonly requestId: Awaited<ReturnType<CookoutClient["startAgentJoin"]>>["requestId"];
}

async function askedWhileLive({ baseURL, page }: Asking): Promise<Asked> {
  const ownerName = unique("browser-join-live");
  const agent = `${ownerName}-agent`;
  const owner = await newIdentity({ kind: "human", name: ownerName });
  await createTestAgent({ by: owner.client, name: agent });
  await owner.client.join({ as: agent });
  const anonymous = testClient({ env: {}, url: baseURL ?? "" });
  const { requestId } = await anonymous.startAgentJoin({ as: agent, host: "build-box" });
  await logIn({ page, token: owner.token, url: "/#/inbox" });
  return { agent, anonymous, requestId };
}

test("a join request for an agent already joined in another session says so, and Dismiss clears it", async ({
  baseURL,
  page,
}) => {
  const { agent, anonymous, requestId } = await askedWhileLive({ baseURL, page });
  const forYou = inPane(page).getByRole("list", { exact: true, name: "For you" });
  const why =
    `@${agent} asks to join from build-box. @${agent} is already joined in another session. ` +
    "Replace ends that session and joins this one; Dismiss clears this request.";

  await expect(forYou.getByText(why, { exact: true })).toBeVisible();
  await expect(forYou.getByRole("button", { exact: true, name: "Approve" })).toHaveCount(NONE);
  await expect(forYou.getByRole("button", { exact: true, name: "Replace" })).toBeVisible();

  await forYou.getByRole("button", { exact: true, name: "Dismiss" }).click();

  await expect(inPane(page).getByText("You're all caught up.", { exact: true })).toBeVisible();
  await expect(anonymous.collectAgentJoin(requestId)).rejects.toMatchObject({ code: "agent_join_request_denied" });
});
