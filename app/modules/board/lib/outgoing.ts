import type { NewAttachment } from "../../sdk/index.ts";

interface OutgoingFile {
  readonly name: string;
  readonly file: Blob;
}

interface Outgoing {
  readonly text: string;
  readonly files: readonly OutgoingFile[];
}

async function attachmentsOf(files: readonly OutgoingFile[]): Promise<readonly NewAttachment[]> {
  const attachments = await Promise.all(
    files.map(async ({ file, name }) => ({ bytes: new Uint8Array(await file.arrayBuffer()), name })),
  );
  return attachments;
}

export { type Outgoing, attachmentsOf };
