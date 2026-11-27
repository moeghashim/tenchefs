import { expect, it, vi } from "vitest";
import { createSessionList } from "../index.ts";

const FIRST = 0;

type Calls = Parameters<typeof createSessionList>[typeof FIRST];

const willEnd = { agentSessions: 0, joinCodes: 0, sessions: 1 };

async function unreachable(): Promise<never> {
  await Promise.resolve();
  throw new Error("board unavailable");
}

async function previewed(): Promise<typeof willEnd> {
  await Promise.resolve();
  return willEnd;
}

function refusing(): Calls {
  return {
    listSessions: unreachable,
    logOutEverywhere: unreachable,
    previewLogOutEverywhere: unreachable,
    revokeSession: unreachable,
  };
}

it("a list that can't load says so, and confirming with nothing asked sends nothing", { timeout: 2000 }, async () => {
  expect.hasAssertions();

  const sent = vi.fn<() => Promise<void>>(unreachable);
  const list = createSessionList({ ...refusing(), logOutEverywhere: sent, revokeSession: sent });
  const unsubscribe = list.subscribe(vi.fn<() => void>());
  list.confirm();
  await vi.waitFor(() => {
    expect(list.snapshot().action.status).toBe("failed");
  });
  unsubscribe();

  expect([list.snapshot().action, sent.mock.calls]).toStrictEqual([
    { code: "unreachable", message: "Error: board unavailable", status: "failed" },
    [],
  ]);
});

it("a Log out everywhere preview that fails says so and asks nothing", { timeout: 2000 }, async () => {
  expect.hasAssertions();

  const list = createSessionList(refusing());
  list.askLogOutEverywhere();
  await vi.waitFor(() => {
    expect(list.snapshot().action.status).toBe("failed");
  });

  expect(list.snapshot().asked).toBeNull();
});

it("a Log out everywhere that fails keeps what was asked until Cancel", { timeout: 2000 }, async () => {
  expect.hasAssertions();

  const list = createSessionList({ ...refusing(), previewLogOutEverywhere: previewed });
  list.askLogOutEverywhere();
  list.confirm();
  await vi.waitFor(() => {
    expect(list.snapshot().action.status).toBe("failed");
  });
  const afterConfirm = list.snapshot().asked;
  list.cancel();

  expect([afterConfirm, list.snapshot()]).toStrictEqual([
    { kind: "everywhere", willEnd },
    { action: { status: "idle" }, asked: null, sessions: null },
  ]);
});
