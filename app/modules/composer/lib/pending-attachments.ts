import type { AttachmentLimitRefusal, ImageContentType } from "../../attachments/index.ts";
import { attachmentLimits, attachmentTooLargeRefusal, tooManyAttachmentsRefusal } from "../../attachments/index.ts";

const FIRST_KEY = 1;
const ONE = 1;

interface PendingAttachment {
  readonly key: number;
  readonly name: string;
  readonly size: number;
  readonly file: Blob;
  readonly preview: string | null;
}

interface AttachRefusal extends AttachmentLimitRefusal {
  readonly name: string;
}

interface PendingSnapshot {
  readonly attachments: readonly PendingAttachment[];
  readonly refusal: AttachRefusal | null;
}

interface PendingAttachments {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => PendingSnapshot;
  readonly attach: (files: readonly File[]) => void;
  readonly remove: (key: number) => void;
  readonly clear: () => void;
}

const EMPTY: PendingSnapshot = { attachments: [], refusal: null };
const SHOWN_AS_IMAGES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] satisfies readonly ImageContentType[];

function previewOf(file: File): string | null {
  if (!SHOWN_AS_IMAGES.includes(file.type)) {
    return null;
  }
  return URL.createObjectURL(file);
}

function released(attachments: readonly PendingAttachment[]): void {
  for (const { preview } of attachments) {
    if (preview !== null) {
      URL.revokeObjectURL(preview);
    }
  }
}

function refusalFor(file: File, count: number): AttachmentLimitRefusal | null {
  if (count >= attachmentLimits.maximumCount) {
    return tooManyAttachmentsRefusal;
  }
  if (file.size > attachmentLimits.maximumBytes) {
    return attachmentTooLargeRefusal;
  }
  return null;
}

interface Attaching {
  readonly current: PendingSnapshot;
  readonly files: readonly File[];
  readonly added: (file: File) => PendingAttachment;
}

function attached({ added, current, files }: Attaching): PendingSnapshot {
  const attachments = [...current.attachments];
  let refusal: AttachRefusal | null = null;
  for (const file of files) {
    const refused = refusalFor(file, attachments.length);
    if (refused === null) {
      attachments.push(added(file));
    } else {
      refusal = { ...refused, name: file.name };
    }
    if (refused === tooManyAttachmentsRefusal) {
      break;
    }
  }
  return { attachments, refusal };
}

function createPendingAttachments(): PendingAttachments {
  const listeners = new Set<() => void>();
  let current = EMPTY;
  let nextKey = FIRST_KEY;

  function change(next: PendingSnapshot): void {
    current = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function added(file: File): PendingAttachment {
    const key = nextKey;
    nextKey += ONE;
    return { file, key, name: file.name, preview: previewOf(file), size: file.size };
  }

  return {
    attach: (files) => {
      change(attached({ added, current, files }));
    },
    clear: () => {
      released(current.attachments);
      change(EMPTY);
    },
    remove: (key) => {
      released(current.attachments.filter((attachment) => attachment.key === key));
      change({ attachments: current.attachments.filter((attachment) => attachment.key !== key), refusal: null });
    },
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export { type PendingAttachment, type PendingAttachments, createPendingAttachments };
