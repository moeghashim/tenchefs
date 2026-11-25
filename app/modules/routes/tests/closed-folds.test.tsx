import { expect, it, vi } from "vitest";
import { feedOf, feedOpened, postedIn } from "./feed.ts";
import { fireEvent } from "@testing-library/react";
import { inPane } from "./regions.ts";

const SIXTEEN = 16;
const FOLDED = 6;
const FROM_ONE = 1;

function notes(count: number): readonly string[] {
  return Array.from({ length: count }, (_unused, index) => `Note ${String(index + FROM_ONE)}.`);
}

async function feedShows(texts: readonly string[], shown: readonly string[]): Promise<void> {
  await vi.waitFor(async () => {
    await expect(feedOf(texts)).resolves.toStrictEqual(shown);
  });
}

it("three consecutive closed threads show as one divider", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const texts = ["Open one.", "Done a.", "Done b.", "Done c.", "Open two."];
  const { channel, reader } = await postedIn({
    channel: "web-fold-three",
    closed: ["Done a.", "Done b.", "Done c."],
    texts,
  });
  const { close } = await feedOpened({ hash: `#/channels/${channel}`, reader });

  await feedShows(texts, ["Open one.", "<3 closed threads>", "Open two."]);

  close();
});

it("an open thread between closed ones splits them into two dividers", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const texts = ["Done a.", "Done b.", "Open one.", "Done c."];
  const { channel, reader } = await postedIn({
    channel: "web-fold-split",
    closed: ["Done a.", "Done b.", "Done c."],
    texts,
  });
  const { close } = await feedOpened({ hash: `#/channels/${channel}`, reader });

  await feedShows(texts, ["<2 closed threads>", "Open one.", "<1 closed thread>"]);

  close();
});

it('a run of 16 expands to the 10 nearest the newest end, then "6 more" shows the rest', {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const closed = notes(SIXTEEN);
  const texts = [...closed, "Still open."];
  const { channel, reader } = await postedIn({ channel: "web-fold-sixteen", closed, texts });
  const { close } = await feedOpened({ hash: `#/channels/${channel}`, reader });
  fireEvent.click(await inPane().findByRole("button", { name: "16 closed threads" }));

  await feedShows(texts, ["<6 more>", ...closed.slice(FOLDED), "Still open."]);

  fireEvent.click(inPane().getByRole("button", { name: "6 more" }));

  await feedShows(texts, [...closed, "Still open."]);

  close();
});

it("after Load older, a run spanning both pages is one divider", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const texts = ["Done a.", "Done b.", "Done c.", "Done d.", "Open one."];
  const { channel, reader } = await postedIn({
    channel: "web-fold-older",
    closed: ["Done a.", "Done b.", "Done c.", "Done d."],
    texts,
  });
  const { close, pageRead } = await feedOpened({ hash: `#/channels/${channel}`, pageSize: 3, reader });
  await feedShows(texts, ["<2 closed threads>", "Open one."]);
  fireEvent.click(inPane().getByRole("button", { name: "Load older messages" }));
  await pageRead();

  await feedShows(texts, ["<4 closed threads>", "Open one."]);

  close();
});
