import { adminClient, anonymousClient, newIdentity, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface Reader {
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function subscribedReader(name: string): Promise<Reader> {
  const poster = await newIdentity({ kind: "agent", name: `${name}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${name}-reader` });
  await adminClient().createChannel({ name });
  await reader.client.subscribe(name);
  return { poster: poster.client, reader: reader.client };
}

function inboxLink(): HTMLElement {
  return inSidebar().getByRole("link", { name: /^Inbox/u });
}

it("#/ opens the inbox, highlighted in the sidebar", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });

  const heading = await screen.findByRole("heading", { level: 1, name: "Inbox" });

  expect([heading.textContent, inboxLink().getAttribute("aria-current")]).toStrictEqual(["Inbox", "page"]);

  close();
});

it("a fresh login opens the inbox", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { client, token } = await newIdentity({ kind: "human", name: "web-sidebar-fresh" });
  const close = openAt({ client, hash: "", session: sessionOf(anonymousClient()) });
  fireEvent.change(await screen.findByLabelText("Token"), { target: { value: token } });
  fireEvent.click(inPane().getByRole("button", { name: "Log in" }));

  const heading = await screen.findByRole("heading", { level: 1, name: "Inbox" });

  expect([heading.textContent, inSidebar().getByText("web-sidebar-fresh").textContent]).toStrictEqual([
    "Inbox",
    "web-sidebar-fresh",
  ]);

  close();
});

async function postedAndCounted(poster: CookoutClient, text: string, count: string): Promise<boolean> {
  await poster.createMessage({ channel: "web-sidebar-total", text });
  await waitFor(() => {
    expect(inboxLink().textContent).toContain(count);
  });
  return inboxLink().querySelector(".bg-mention-bar") !== null;
}

it("the Inbox link is bold for activity, and counts what is for you live, in the accent colour", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { poster, reader } = await subscribedReader("web-sidebar-total");
  const { live, stream } = watched(reader);
  const close = openAt({ client: reader, hash: "#/", live });
  const events = await stream;
  const plainIsLoud = await postedAndCounted(poster, "Plain news", "1 unread");

  await expect(postedAndCounted(poster, "Over to @web-sidebar-total-reader", "1 for you")).resolves.toBe(!plainIsLoud);

  close();
  await events.close();
});

it("a channel with unread messages is bold in the sidebar, with its count for you, and the open one is highlighted", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { poster, reader } = await subscribedReader("web-sidebar-bold");
  await adminClient().createChannel({ name: "web-sidebar-quiet" });
  await poster.createMessage({ channel: "web-sidebar-bold", text: "Hi @web-sidebar-bold-reader" });
  const close = openAt({ client: reader, hash: "#/channels/web-sidebar-quiet" });

  const bold = await within(await screen.findByRole("navigation", { name: "Sidebar" })).findByRole("link", {
    name: /^#web-sidebar-bold\s*1 for you$/u,
  });
  const quiet = inSidebar().getByRole("link", { name: "#web-sidebar-quiet" });

  expect([
    within(bold).getByText("#web-sidebar-bold").className.includes("font-semibold"),
    within(quiet).getByText("#web-sidebar-quiet").className.includes("font-semibold"),
    quiet.getAttribute("aria-current"),
    bold.getAttribute("aria-current"),
  ]).toStrictEqual([true, false, "page", "false"]);

  close();
});

it("the People & agents link goes to the directory of identities", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  fireEvent.click(
    await within(await screen.findByRole("navigation", { name: "Sidebar" })).findByRole("link", {
      name: "People & agents",
    }),
  );

  const heading = await screen.findByRole("heading", { level: 1, name: "People & agents" });

  expect([globalThis.location.hash, heading.textContent]).toStrictEqual(["#/people", "People & agents"]);

  close();
});

it("the sidebar has no Open threads link", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  await screen.findByRole("heading", { level: 1, name: "Inbox" });

  expect([
    inSidebar().queryByRole("link", { name: /Open threads/u }),
    inSidebar().element().textContent.includes("Open threads"),
  ]).toStrictEqual([null, false]);

  close();
});

it.each(["#/threads", "#/threads/all"])(
  "an old Open threads link, %s, opens the inbox",
  { timeout: 5000 },
  async (hash) => {
    expect.hasAssertions();

    const close = openAt({ client: adminClient(), hash });

    const heading = await screen.findByRole("heading", { level: 1, name: "Inbox" });

    expect([heading.textContent, inboxLink().getAttribute("aria-current")]).toStrictEqual(["Inbox", "page"]);

    close();
  },
);

it("the cookout name at the top of the sidebar is a link that opens the inbox", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-sidebar-home" });
  const close = openAt({ client: adminClient(), hash: "#/channels/web-sidebar-home" });
  fireEvent.click(
    await within(await screen.findByRole("navigation", { name: "Sidebar" })).findByRole("link", { name: "cookout" }),
  );

  const heading = await screen.findByRole("heading", { level: 1, name: "Inbox" });

  expect([globalThis.location.hash, heading.textContent, inboxLink().getAttribute("aria-current")]).toStrictEqual([
    "#/inbox",
    "Inbox",
    "page",
  ]);

  close();
});

it("a hash no page has opens the inbox", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/nowhere" });

  const heading = await screen.findByRole("heading", { level: 1, name: "Inbox" });

  expect([heading.textContent, inboxLink().getAttribute("aria-current")]).toStrictEqual(["Inbox", "page"]);

  close();
});
