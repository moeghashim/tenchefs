import type { CookoutClient, Message, NewAttachment, PostMessageRequest } from "../../sdk/index.ts";
import { vi } from "vitest";

interface FilePost extends PostMessageRequest {
  readonly client: CookoutClient;
  readonly attachments: readonly NewAttachment[];
}

async function nodeFormData(): Promise<unknown> {
  const form = await new Response("a=1", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }).formData();
  return form.constructor;
}

async function nodeBlob(): Promise<unknown> {
  const blob = await new Response("a").blob();
  return blob.constructor;
}

async function withNodeForms<Answer>(send: () => Promise<Answer>): Promise<Answer> {
  vi.stubGlobal("FormData", await nodeFormData());
  vi.stubGlobal("Blob", await nodeBlob());
  try {
    return await send();
  } finally {
    vi.unstubAllGlobals();
  }
}

async function postedWithFiles({ client, ...post }: FilePost): Promise<Message> {
  const { message } = await withNodeForms(async () => {
    const answer = await client.createMessage(post);
    return answer;
  });
  return message;
}

export { postedWithFiles, withNodeForms };
