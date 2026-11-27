import type { PendingAttachments } from "./pending-attachments.ts";
import { createPendingAttachments } from "./pending-attachments.ts";

interface Clearable {
  readonly clear: () => void;
}

function withAttachments<Draft extends Clearable>(draft: Draft): Draft & { readonly attachments: PendingAttachments } {
  const attachments = createPendingAttachments();
  return {
    ...draft,
    attachments,
    clear: () => {
      attachments.clear();
      draft.clear();
    },
  };
}

interface Kept<Store> {
  readonly stores: Map<string, Store>;
  readonly key: string;
  readonly make: () => Store;
}

function storeIn<Store>({ key, make, stores }: Kept<Store>): Store {
  const store = stores.get(key) ?? make();
  stores.set(key, store);
  return store;
}

export { storeIn, withAttachments };
export type { PendingAttachments } from "./pending-attachments.ts";
