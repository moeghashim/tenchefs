import type { CookoutClient, EventStream, MessageId } from "../../sdk/index.ts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { InChannel } from "./webhook-commands.ts";
import type { Region } from "./regions.ts";
import { adminClient } from "./identities.ts";
import { channelWithWebhookCommand } from "./webhook-commands.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface Threaded {
  readonly handler: CookoutClient;
  readonly parent: MessageId;
}

interface Opening {
  readonly hash: string;
  readonly region: Region;
  readonly client?: CookoutClient;
}

interface Replying {
  readonly box: () => HTMLTextAreaElement;
  readonly type: (text: string) => void;
  readonly send: (text: string) => void;
  readonly suggestions: (text: string) => Promise<readonly (string | null)[]>;
  readonly pick: (name: string) => Promise<HTMLElement>;
  readonly calledFrom: (text: string) => Promise<void>;
}

async function threadWithWebhookCommand(inChannel: InChannel): Promise<Threaded> {
  const handler = await channelWithWebhookCommand(inChannel);
  const { message } = await adminClient().createMessage({ channel: inChannel.channel, text: "Ship it?" });
  return { handler, parent: message.id };
}

function replyBox(region: Region): HTMLTextAreaElement {
  const box = within(region.element()).getByLabelText("Reply", { selector: "textarea" });
  if (!(box instanceof HTMLTextAreaElement)) {
    throw new TypeError("No reply box");
  }
  return box;
}

async function openReplying({ client = adminClient(), hash, region }: Opening): Promise<() => Promise<void>> {
  const { live, stream } = watched(client);
  const unmount = openAt({ client, hash, live });
  const events: EventStream = await stream;
  await waitFor(() => replyBox(region));
  return async () => {
    unmount();
    await events.close();
  };
}

function replyingIn(region: Region): Replying {
  function type(text: string): void {
    fireEvent.change(replyBox(region), { target: { value: text } });
  }
  function send(text: string): void {
    type(text);
    fireEvent.keyDown(replyBox(region), { key: "Enter" });
  }
  async function listed(): Promise<HTMLElement> {
    const list = await region.findByRole("listbox", { name: "Command suggestions" });
    return list;
  }
  return {
    box: () => replyBox(region),
    calledFrom: async (text) => {
      send(text);
      await within(region.element()).findByLabelText(`Call to ${text.replace(/ .*/u, "")}`);
    },
    pick: async (name) => {
      type("/");
      type(`/${name}`);
      fireEvent.mouseDown(within(await listed()).getByRole("option", { name: new RegExp(`^/${name}`, "u") }));
      return region.getByRole("form", { name: `Call /${name}` });
    },
    send,
    suggestions: async (text) => {
      type(text);
      const shown: (string | null)[] = [];
      for (const option of within(await listed()).getAllByRole("option")) {
        shown.push(option.textContent);
      }
      return shown;
    },
    type,
  };
}

async function threadTexts(parent: MessageId): Promise<readonly string[]> {
  const { replies } = await adminClient().getThread(parent);
  return replies.map((reply) => reply.text);
}

async function newestIn(parent: MessageId): Promise<MessageId> {
  const { replies } = await adminClient().getThread(parent);
  let newest = parent;
  for (const reply of replies) {
    newest = reply.id;
  }
  return newest;
}

async function topLevelTexts(channel: string): Promise<readonly string[]> {
  const { messages } = await adminClient().listMessages(channel);
  return messages.map((message) => message.text);
}

function callForms(name: string): number {
  return screen.queryAllByRole("form", { name: `Call /${name}` }).length;
}

export { callForms, newestIn, openReplying, replyingIn, threadTexts, threadWithWebhookCommand, topLevelTexts };
