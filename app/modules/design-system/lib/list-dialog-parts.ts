import type { Parts } from "./parts.ts";

interface ListDialogContentParts extends Parts {
  readonly title: string;
  readonly description: string;
  readonly close: string;
}

interface ListDialogParts extends ListDialogContentParts {
  readonly open: boolean;
  readonly onClose: () => void;
}

export type { ListDialogContentParts, ListDialogParts };
