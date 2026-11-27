import type { JsonValue, MessageId } from "../../sdk/index.ts";
import type { PageAt, PageOps } from "./page-reads.ts";
import { appliedToMessages, withFresh } from "./messages-table.ts";
import { callFailure, notJson, parseData } from "./webhook-command-call.ts";
import type { CallRequest } from "./webhook-command-call.ts";
import type { Outgoing } from "./outgoing.ts";
import { attachmentsOf } from "./outgoing.ts";
import { failure } from "./failure.ts";

interface PostRequest extends Outgoing {
  readonly posted: () => void;
}

interface PageCalls {
  readonly call: (request: CallRequest) => Promise<void>;
  readonly post: (request: PostRequest) => Promise<void>;
}

interface Calling {
  readonly at: PageAt;
  readonly ops: PageOps;
}

async function addNewest({ at, ops }: Calling, { called, webhookCommand: command }: CallRequest): Promise<void> {
  await at.held.readInto({
    change: (held, read) =>
      ops.changed((page) => {
        const newest = Math.max(...page.ids);
        const added: readonly MessageId[] = read.messages
          .filter((message) => message.id > newest)
          .map((message) => message.id);
        return {
          ...page,
          call: { status: "called", webhookCommand: command },
          callData: "",
          ids: [...page.ids, ...added],
        };
      })(withFresh({ fresh: read, held })),
    request: async () => {
      const read = await at.client.listMessages(at.name, { limit: at.pageSize });
      return read;
    },
  });
  called();
}

function tellRefused({ refused }: CallRequest): void {
  if (refused !== null) {
    refused();
  }
}

interface Sending {
  readonly data: JsonValue;
  readonly request: CallRequest;
}

async function sendCall(calling: Calling, { data, request }: Sending): Promise<void> {
  const { at, ops } = calling;
  const { webhookCommand: command } = request;
  ops.update((page) => ({ ...page, call: { status: "calling", webhookCommand: command } }));
  try {
    await at.client.callCommand(command, { channel: at.name, data });
    await addNewest(calling, request);
  } catch (error: unknown) {
    ops.update((page) => ({ ...page, call: callFailure({ error, webhookCommand: command }) }));
    tellRefused(request);
  }
}

async function callWebhookCommand(calling: Calling, request: CallRequest): Promise<void> {
  const { ops } = calling;
  const { webhookCommand: command } = request;
  const parsed = parseData(request.data);
  if (parsed.status === "not-json") {
    ops.update((page) => ({ ...page, call: notJson(command) }));
    tellRefused(request);
    return;
  }
  await sendCall(calling, { data: parsed.data, request });
}

async function postMessage({ at, ops }: Calling, { files, posted, text }: PostRequest): Promise<void> {
  ops.update((page) => ({ ...page, post: { status: "posting" } }));
  try {
    const attachments = await attachmentsOf(files);
    const { message } = await at.client.createMessage({ attachments, channel: at.name, text });
    at.held.put(appliedToMessages({ event: { message, type: "message" }, held: at.held.current() }));
    ops.update((page) => ({ ...page, post: { status: "idle" } }));
    posted();
  } catch (error: unknown) {
    ops.update((page) => ({ ...page, post: failure(error) }));
  }
}

function pageCalls(calling: Calling): PageCalls {
  return {
    call: async (request) => {
      await callWebhookCommand(calling, request);
    },
    post: async (request) => {
      await postMessage(calling, request);
    },
  };
}

export { type PostRequest, pageCalls };
