import { expect, it } from "vitest";
import { cronWords } from "../index.ts";

it.for([
  ["0 9 * * *", "Every day at 09:00"],
  ["30 7 * * 1-5", "Weekdays at 07:30"],
  ["0 10 * * 0,6", "Weekends at 10:00"],
  ["5 9 * * 1,3", "Every Monday and Wednesday at 09:05"],
  ["0 9 * * 7", "Every Sunday at 09:00"],
  ["15 8 1 * *", "On day 1 of every month at 08:15"],
  ["*/15 * * * *", "Every 15 minutes"],
  ["5 * * * *", "Every hour at 05 minutes past"],
] as const)("the cron expression %s reads as %s", { timeout: 1000 }, ([cron, words]) => {
  expect.hasAssertions();

  expect(cronWords(cron)).toBe(words);
});

it.for([
  "0 9 * *",
  "0 9 1 6 *",
  "0 9 1 * 1",
  "0 9 * * MON",
  "0 */2 * * *",
  "*/x * * * *",
  "1-5 * * * *",
  "0 9 L * *",
] as const)("the cron expression %s has no words, only itself", { timeout: 1000 }, (cron) => {
  expect.hasAssertions();

  expect(cronWords(cron)).toBeNull();
});
