import { expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { Message } from "../../sdk/index.ts";
import { adminClient } from "./identities.ts";
import { clockStoppedAt } from "./clock.ts";
import { openAt } from "./render.tsx";
import { timeTooltipOf } from "./time-tooltips.ts";

const JUST_UNDER_TEN_SECONDS = 9000;
const TEN_SECONDS = 10_000;
const JUST_UNDER_A_MINUTE = 59_000;
const A_MINUTE = 60_000;
const JUST_UNDER_AN_HOUR = 3_540_000;
const AN_HOUR = 3_600_000;
const TWO_HOURS = 7_200_000;
const JUST_UNDER_A_DAY = 82_800_000;
const A_DAY = 86_400_000;
const TWO_DAYS = 172_800_000;
const AGES = [
  JUST_UNDER_TEN_SECONDS,
  TEN_SECONDS,
  JUST_UNDER_A_MINUTE,
  A_MINUTE,
  JUST_UNDER_AN_HOUR,
  AN_HOUR,
  TWO_HOURS,
  JUST_UNDER_A_DAY,
  A_DAY,
  TWO_DAYS,
];
const NONE = 0;
const SHOWN_TIME = /just now|ago$|\d\d:\d\d$/u;

async function posted(channel: string): Promise<Message> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "Deploy at noon?" });
  clockStoppedAt(message.createdAt);
  return message;
}

async function shownTime(): Promise<HTMLElement> {
  const list = await screen.findByRole("feed", { name: "Messages" });
  const article = await within(list).findByRole("article");
  return within(article).getByText(SHOWN_TIME);
}

async function shownAt(message: Message, age: number): Promise<string | null> {
  vi.setSystemTime(message.createdAt);
  vi.advanceTimersByTime(age);
  const unmount = openAt({ client: adminClient(), hash: `#/channels/${message.channel}` });
  const { textContent } = await shownTime();
  unmount();
  return textContent;
}

async function shownFrom(message: Message, ages: readonly number[]): Promise<readonly (string | null)[]> {
  if (ages.length === NONE) {
    return [];
  }
  const [age = NONE, ...older] = ages;
  const first = await shownAt(message, age);
  const rest = await shownFrom(message, older);
  return [first, ...rest];
}

it("a message's time says how long ago it was posted, and from a day on its date and time", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const message = await posted("web-message-times");
  const shown = await shownFrom(message, AGES);

  expect(shown).toStrictEqual([
    "just now",
    "10 seconds ago",
    "50 seconds ago",
    "1 minute ago",
    "59 minutes ago",
    "1 hour ago",
    "2 hours ago",
    "23 hours ago",
    expect.stringMatching(/^Yesterday \d\d:\d\d$/u),
    expect.stringMatching(/^\d{1,2} [A-Z][a-z]{2} \d\d:\d\d$/u),
  ]);
});

it("a message's time ticks live from just now to 1 minute ago, and its hover shows the full date and time", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const message = await posted("web-message-ticks");
  const unmount = openAt({ client: adminClient(), hash: `#/channels/${message.channel}` });
  const first = await shownTime();
  const before = first.textContent;
  vi.advanceTimersByTime(A_MINUTE);
  const after = await screen.findByText("1 minute ago");

  expect([
    before,
    after.getAttribute("datetime"),
    timeTooltipOf(() => within(screen.getByRole("feed", { name: "Messages" })).getByRole("article")),
  ]).toStrictEqual(["just now", message.createdAt, [expect.stringMatching(/\d{4} at \d\d:\d\d$/u)]]);

  unmount();
});
