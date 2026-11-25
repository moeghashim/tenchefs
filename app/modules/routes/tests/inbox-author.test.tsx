import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inboxOpened, subscribedReader } from "./inbox-reader.ts";
import { agentShown } from "./identities.ts";
import { inProfile } from "./regions.ts";
import { testAgentDisplayName } from "../../testing/index.ts";

async function forYouRow(): Promise<HTMLElement> {
  const list = await screen.findByRole("list", { name: "For you" });
  return within(list).getByRole("listitem");
}

async function linksShown(): Promise<readonly (readonly (string | null)[])[]> {
  const shown: (readonly (string | null)[])[] = [];
  for (const link of within(await forYouRow()).getAllByRole("link")) {
    shown.push([link.getAttribute("href"), link.textContent]);
  }
  return shown;
}

async function rowLinkHref(): Promise<string | null> {
  const row = await forYouRow();
  return within(row)
    .getByRole("link", { name: /^Mentioned you.*posted in/u })
    .getAttribute("href");
}

it("an Inbox row's author name opens their profile beside the inbox, and the rest of the row opens the message", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-inbox-author";
  const { poster, reader } = await subscribedReader(channel);
  await poster.createMessage({ channel, text: `Ship it, @${channel}-reader?` });
  const { unmount } = await inboxOpened({ author: `${channel}-poster`, reader });
  const before = [await linksShown(), await rowLinkHref()];
  fireEvent.click(within(await forYouRow()).getByRole("link", { name: testAgentDisplayName(`${channel}-poster`) }));
  const heading = await inProfile().findByRole("heading", { level: 3 });

  expect([
    before,
    globalThis.location.hash,
    heading.textContent,
    within(await forYouRow()).getByText(`@${channel}-reader`).tagName,
  ]).toStrictEqual([
    [
      [
        [`#/inbox/${channel}`, "Mentioned you"],
        [`#/inbox?profile=${channel}-poster`, testAgentDisplayName(`${channel}-poster`)],
      ],
      `#/inbox/${channel}`,
    ],
    `#/inbox?profile=${channel}-poster`,
    `${agentShown(`${channel}-poster`)}agent`,
    "MARK",
  ]);

  unmount();
});
