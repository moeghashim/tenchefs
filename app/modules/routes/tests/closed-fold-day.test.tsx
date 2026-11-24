import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { postedIn } from "./feed.ts";

const ONE = 1;

async function itemOf(text: string): Promise<HTMLElement> {
  const shown = await inPane().findByText(text);
  const item = shown.closest("li");
  if (item === null) {
    throw new TypeError(`${text} is in no list item`);
  }
  return item;
}

it("a fold before the day's first shown message shares the day separator's row", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { channel, reader } = await postedIn({
    channel: "web-fold-day",
    closed: ["Done a.", "Done b."],
    texts: ["Done a.", "Done b.", "Open one."],
  });
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });
  const fold = await itemOf("2 closed threads");

  expect(within(fold).getByRole("separator", { name: "Today" })).toBeDefined();
  expect(within(await itemOf("Open one.")).queryByRole("separator", { name: "Today" })).toBeNull();

  close();
});

it("unfolding the fold gives the day separator back to the first message", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { channel, reader } = await postedIn({
    channel: "web-fold-day-open",
    closed: ["Done a."],
    texts: ["Done a.", "Open one."],
  });
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });
  fireEvent.click(await inPane().findByRole("button", { name: "1 closed thread" }));

  expect(within(await itemOf("Done a.")).getByRole("separator", { name: "Today" })).toBeDefined();
  expect(screen.queryAllByRole("separator", { name: "Today" })).toHaveLength(ONE);

  close();
});
