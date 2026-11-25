import type { AgentJoinApproval, LoginApproval } from "../index.ts";
import {
  createAgentJoinApprovals,
  createChannelCreation,
  createLoginApprovals,
  createScheduleList,
  createScheduling,
} from "../index.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { adminClient } from "./held-store.ts";
import { browserClock } from "../../format/index.ts";
import { recordPublishes } from "../../testing/web.ts";

const NONE = 0;
const NO_PAUSE = 0;
const UNKNOWN_CODE = "ZZZZ-ZZZZ";

type SchedulingOptions = Parameters<typeof createScheduling>[number];

it("the channel creation publishes nothing when closed again or given the same name and description", {
  timeout: 5000,
}, () => {
  expect.hasAssertions();

  const creation = createChannelCreation({
    createChannel: vi.fn<Parameters<typeof createChannelCreation>[number]["createChannel"]>(),
  });
  const publishes = recordPublishes(creation);

  creation.close();
  creation.editName(creation.snapshot().name);
  creation.editDescription(creation.snapshot().description);

  expect(publishes.count()).toBe(NONE);
});

it("the schedule list publishes nothing when closed again or a delete cancelled with none asked", {
  timeout: 5000,
}, () => {
  expect.hasAssertions();

  const list = createScheduleList({ change: vi.fn<Parameters<typeof createScheduleList>[number]["change"]>() });
  const publishes = recordPublishes(list);

  list.close();
  list.cancelDelete();

  expect(publishes.count()).toBe(NONE);
});

it("the scheduling dialog publishes nothing when closed again or given the same text", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const scheduling = createScheduling({
    clock: browserClock,
    create: vi.fn<SchedulingOptions["create"]>(),
    edit: vi.fn<SchedulingOptions["edit"]>(),
    pause: NO_PAUSE,
    preview: vi.fn<SchedulingOptions["preview"]>(),
    timeZone: "Europe/London",
  });
  const publishes = recordPublishes(scheduling);

  scheduling.close();
  scheduling.dismiss();
  scheduling.editText(scheduling.snapshot().text);

  expect(publishes.count()).toBe(NONE);
});

async function refused<Approval extends AgentJoinApproval | LoginApproval>(approval: Approval): Promise<Approval> {
  onTestFinished(approval.subscribe(vi.fn<() => void>()));
  await vi.waitFor(() => {
    expect(approval.snapshot().status).toBe("refused");
  });
  return approval;
}

it("a refused login or agent join request publishes nothing when another reader comes or Approve is pressed", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const login = await refused(createLoginApprovals(adminClient()).forCode(UNKNOWN_CODE));
  const join = await refused(createAgentJoinApprovals(adminClient()).forCode(UNKNOWN_CODE));
  const publishes = [recordPublishes(login), recordPublishes(join)];

  onTestFinished(login.subscribe(vi.fn<() => void>()));
  onTestFinished(join.subscribe(vi.fn<() => void>()));
  login.approve();
  join.approve();

  expect(publishes.map((each) => each.count())).toStrictEqual([NONE, NONE]);
});
