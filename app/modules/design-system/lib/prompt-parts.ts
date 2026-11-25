import type { Parts } from "./parts.ts";

interface PromptButtonsParts {
  readonly busy: boolean;
  readonly button: string;
  readonly busyButton: string;
  readonly onCancel: () => void;
  readonly disabled?: boolean;
}

interface PromptFormParts extends Parts, PromptButtonsParts {
  readonly label: string;
  readonly title: string;
  readonly description: string | null;
  readonly onSubmit: () => void;
}

interface PromptFieldParts {
  readonly label: string;
  readonly help: string | null;
  readonly error: string | null;
  readonly required: boolean;
}

interface FieldIds {
  readonly control: string;
  readonly help: string;
  readonly error: string;
  readonly describedBy: string;
}

interface FieldLabelParts {
  readonly label: string;
  readonly required: boolean;
  readonly ids: FieldIds;
}

interface FieldNotesParts {
  readonly help: string | null;
  readonly error: string | null;
  readonly ids: FieldIds;
}

interface InputFieldParts extends PromptFieldParts {
  readonly kind: "text" | "number" | "integer" | "date" | "time";
  readonly value: string;
  readonly onEdit: (value: string) => void;
}

interface PickFieldParts extends PromptFieldParts {
  readonly options: readonly string[];
  readonly value: string;
  readonly onEdit: (value: string) => void;
}

interface CheckFieldParts extends PromptFieldParts {
  readonly checked: boolean;
  readonly onEdit: (checked: boolean) => void;
}

export type {
  CheckFieldParts,
  FieldIds,
  FieldLabelParts,
  FieldNotesParts,
  InputFieldParts,
  PickFieldParts,
  PromptButtonsParts,
  PromptFieldParts,
  PromptFormParts,
};
