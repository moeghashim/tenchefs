interface ConfirmButtonsParts {
  readonly confirm: string;
  readonly destructive: boolean;
  readonly pending: boolean;
  readonly onConfirm: () => void;
}

interface ConfirmContentParts extends ConfirmButtonsParts {
  readonly title: string;
  readonly body: string;
  readonly error: string | null;
  readonly returnTo: string | null;
  readonly onCloseFocused?: (() => void) | undefined;
}

interface ConfirmDialogParts extends ConfirmContentParts {
  readonly open: boolean;
  readonly onCancel: () => void;
}

export type { ConfirmButtonsParts, ConfirmContentParts, ConfirmDialogParts };
