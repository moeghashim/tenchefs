import type { JsonValue, MessageId } from "../../sdk/index.ts";
import type { PageAt, PageOps } from "./page-reads.ts";
import { appliedToMessages, withFresh } from "./messages-table.ts";
import { callFailure, notJson, parseData } from "./command-call.ts";
import type { CallRequest } from "./command-call.ts";
import { failure } from "./failure.ts";

interface PostRequest {
  readonly text: string;
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

async function addNewest({ at, ops }: Calling, { called, command }: CallRequest): Promise<void> {
  await at.held.readInto({
    change: (held, read) =>
      ops.changed((page) => {
        const newest = Math.max(...page.ids);
        const added: readonly MessageId[] = read.messages
          .filter((message) => message.id > newest)
          .map((message) => message.id);
        return { ...page, call: { command, status: "called" }, callData: "", ids: [...page.ids, ...added] };
      })(withFresh({ fresh: read, held })),
    request: async () => {
      const read = await at.client.listMessages(at.name, { limit: at.pageSize });
      return read;
    },
  });
  called();
}

interface Sending {
  readonly data: JsonValue;
  readonly request: CallRequest;
}

async function sendCall(calling: Calling, { data, request }: Sending): Promise<void> {
  const { at, ops } = calling;
  const { command } = request;
  ops.update((page) => ({ ...page, call: { command, status: "calling" } }));
  try {
    await at.client.callCommand(command, { channel: at.name, data });
    await addNewest(calling, request);
  } catch (error: unknown) {
    ops.update((page) => ({ ...page, call: callFailure({ command, error }) }));
  }
}

async function callCommand(calling: Calling, request: CallRequest): Promise<void> {
  const { ops } = calling;
  const { command } = request;
  const parsed = parseData(request.data);
  if (parsed.status === "not-json") {
    ops.update((page) => ({ ...page, call: notJson(command) }));
    return;
  }
  await sendCall(calling, { data: parsed.data, request });
}

async function postMessage({ at, ops }: Calling, { posted, text }: PostRequest): Promise<void> {
  ops.update((page) => ({ ...page, post: { status: "posting" } }));
  try {
    const { message } = await at.client.createMessage({ channel: at.name, text });
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
      await callCommand(calling, request);
    },
    post: async (request) => {
      await postMessage(calling, request);
    },
  };
}

export { type PostRequest, pageCalls };
