interface ShortcutRowParts {
  readonly does: string;
  readonly chords: readonly string[];
}

interface ShortcutGroupParts {
  readonly heading: string;
  readonly shortcuts: readonly ShortcutRowParts[];
}

interface ShortcutListContentParts {
  readonly title: string;
  readonly description: string;
  readonly groups: readonly ShortcutGroupParts[];
}

interface ShortcutListParts extends ShortcutListContentParts {
  readonly open: boolean;
  readonly onClose: () => void;
}

export type { ShortcutGroupParts, ShortcutListContentParts, ShortcutListParts, ShortcutRowParts };
