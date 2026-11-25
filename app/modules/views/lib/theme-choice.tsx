import type { Layout, ThemeChoice as Theme } from "../../layout/index.ts";
import { useCallback, useSyncExternalStore } from "react";
import { ChoiceGroup } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";
import { themeChoices } from "../../layout/index.ts";

const TEXT = { theme: "Theme" } as const;

const THEMES = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

interface ThemeChoiceProps {
  readonly layout: Layout;
}

function themesOf(value: string): readonly Theme[] {
  return themeChoices.filter((choice) => choice === value);
}

export function ThemeChoice(props: ThemeChoiceProps): ReactNode {
  const { layout } = props;
  const state = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const handleChoose = useCallback(
    (value: string) => {
      for (const theme of themesOf(value)) {
        layout.chooseTheme(theme);
      }
    },
    [layout],
  );
  return <ChoiceGroup choices={THEMES} label={TEXT.theme} onChoose={handleChoose} value={state.theme} />;
}
