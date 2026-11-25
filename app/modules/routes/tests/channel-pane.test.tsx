import { adminClient, sessionOf } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inSidebar, inTopBar } from "./regions.ts";
import { openAt } from "./render.tsx";
import { unreachableClient } from "../../testing/index.ts";

it("a channel's messages scroll in their own region, and a message sent after scrolling still joins the list", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-pane-scroll" });
  const close = openAt({ client: adminClient(), hash: "#/channels/web-pane-scroll" });
  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "After a scroll" } });
  fireEvent.scroll(screen.getByRole("region", { name: "Messages in #web-pane-scroll" }));
  fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });

  const region = screen.getByRole("region", { name: "Messages in #web-pane-scroll" });

  await expect(within(region).findByText("After a scroll")).resolves.toHaveProperty("textContent", "After a scroll");

  close();
});

it("a channel whose messages can't be loaded says why in its pane", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const client = unreachableClient({ token: "cookout_any" });
  const close = openAt({ client, hash: "#/channels/web-pane-unreachable", session: sessionOf(adminClient()) });

  const region = await screen.findByRole("region", { name: "Messages in #web-pane-unreachable" });

  await expect(within(region).findByRole("alert")).resolves.toHaveProperty(
    "textContent",
    expect.stringMatching(/^Couldn't load the messages \(unreachable\)/u),
  );

  close();
});

it("on a narrow screen the sidebar opens from its button and closes when a link in it is followed", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = openAt({ client: adminClient(), hash: "#/" });
  fireEvent.click(await inTopBar().findByRole("button", { name: "Open the sidebar" }));
  const opened = inTopBar().getByRole("button", { name: "Close the sidebar" }).getAttribute("aria-expanded");
  fireEvent.click(inSidebar().getByRole("link", { name: "People & agents" }));

  expect([
    opened,
    inTopBar().getByRole("button", { name: "Open the sidebar" }).getAttribute("aria-expanded"),
  ]).toStrictEqual(["true", "false"]);

  close();
});
