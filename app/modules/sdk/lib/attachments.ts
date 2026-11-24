import type { AttachmentCalls, PostMessageRequest } from "../../messages/client.ts";
import { assetPath, attachmentPartName, messagePartName } from "../../attachments/index.ts";
import type { ClientConnection } from "./request.ts";
import type { NewAttachment } from "../../attachments/index.ts";
import { sendForBytes } from "./request.ts";

const NONE = 0;
const FULL_NAME = "filename*=UTF-8''";
const LATER_PARAMETERS = /;.*$/su;

function nameIn(disposition: string): string {
  const [, encoded = ""] = disposition.split(FULL_NAME);
  return decodeURIComponent(encoded.replace(LATER_PARAMETERS, ""));
}

export interface CreateMessageRequest extends PostMessageRequest {
  readonly attachments?: readonly NewAttachment[];
}

export function postBody(request: CreateMessageRequest): PostMessageRequest | FormData {
  const { attachments = [], ...post } = request;
  if (attachments.length === NONE) {
    return post;
  }
  const form = new FormData();
  form.append(messagePartName, JSON.stringify(post));
  for (const { bytes, name } of attachments) {
    form.append(attachmentPartName, new Blob([Uint8Array.from(bytes)]), name);
  }
  return form;
}

export function attachmentCalls(server: ClientConnection): AttachmentCalls {
  return {
    getAttachment: async (id) => {
      const { bytes, headers } = await sendForBytes({
        connection: server,
        method: "GET",
        params: { id },
        path: assetPath,
      });
      return {
        bytes,
        contentType: headers.get("content-type") ?? "",
        name: nameIn(headers.get("content-disposition") ?? ""),
      };
    },
  };
}
