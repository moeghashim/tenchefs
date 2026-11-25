import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { adminClient, agentOption, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createTestAgent } from "../../testing/index.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface Open {
  readonly human: CookoutClient;
  readonly close: () => Promise<void>;
}

async function openChannel(prefix: string): Promise<Open> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  const reader = await newIdentity({ kind: "human", name: `${prefix}-reader` });
  await adminClient().createChannel({ name: prefix });
  const { live, stream } = watched(reader.client);
  const unmount = openAt({ client: reader.client, hash: `#/channels/${prefix}`, live });
  await screen.findByLabelText("Message");
  const events: EventStream = await stream;
  return {
    close: async () => {
      unmount();
      await events.close();
    },
    human: human.client,
  };
}

function suggestionsFor(text: string): readonly string[] {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
  const shown: string[] = [];
  for (const list of screen.queryAllByRole("listbox", { name: "Mention suggestions" })) {
    for (const option of within(list).getAllByRole("option")) {
      shown.push(option.textContent);
    }
  }
  return shown;
}

it("an agent created elsewhere shows in the @ suggestions without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close } = await openChannel("web-new-agent");
  await createTestAgent({ by: adminClient(), name: "web-new-agent-bot", owner: "web-new-agent-human" });

  await waitFor(() => {
    expect(suggestionsFor("@web-new-agent-b")).toStrictEqual([agentOption("web-new-agent-bot")]);
  });

  await close();
});

it("an agent deactivated elsewhere leaves the @ suggestions without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await newIdentity({ kind: "human", name: "web-new-gone-boss" });
  await newIdentity({ kind: "agent", name: "web-new-gone-bot", owner: "web-new-gone-boss" });
  const { close } = await openChannel("web-new-gone");
  await waitFor(() => {
    expect(suggestionsFor("@web-new-gone-bot")).toStrictEqual([agentOption("web-new-gone-bot")]);
  });
  await adminClient().deactivateIdentity("web-new-gone-bot");

  await waitFor(() => {
    expect(suggestionsFor("@web-new-gone-bot")).toStrictEqual([]);
  });

  await close();
});

it("a channel created elsewhere shows in the sidebar's channel list without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, human } = await openChannel("web-new-channel");
  await human.createChannel({ name: "web-new-channel-new" });
  const list = screen.getByRole("list", { name: "Channels" });

  await expect(within(list).findByRole("link", { name: /web-new-channel-new/u })).resolves.toHaveProperty(
    "hash",
    "#/channels/web-new-channel-new",
  );

  await close();
});
