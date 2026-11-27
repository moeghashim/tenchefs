interface PanelTitleEdit {
  readonly label: string;
  readonly focused: boolean;
  readonly onEdit: () => void;
}

interface PanelTitleField {
  readonly label: string;
  readonly field: string;
  readonly text: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onText: (text: string) => void;
  readonly onSave: () => Promise<void>;
}

interface PanelTitling {
  readonly edit: PanelTitleEdit;
  readonly field: PanelTitleField | null;
}

export type { PanelTitleEdit, PanelTitleField, PanelTitling };
