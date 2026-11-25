import type { KindChoice as Kind, Layout } from "../../layout/index.ts";
import { useCallback, useMemo } from "react";
import { ChoiceGroup } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";

const TEXT = { kind: "Kind" } as const;

const KINDS = [
  { kind: "all", label: "All" },
  { kind: "human", label: "Humans" },
  { kind: "agent", label: "Agents" },
] as const;

interface KindFilterProps {
  readonly counts: Readonly<Record<Kind, number>>;
  readonly layout: Layout;
  readonly value: Kind;
}

function kindsOf(value: string): readonly Kind[] {
  return KINDS.filter((each) => each.kind === value).map((each) => each.kind);
}

export function KindFilter(props: KindFilterProps): ReactNode {
  const { counts, layout } = props;
  const choices = useMemo(
    () => KINDS.map((each) => ({ label: `${each.label} ${String(counts[each.kind])}`, value: each.kind })),
    [counts],
  );
  const handleChoose = useCallback(
    (value: string) => {
      for (const kind of kindsOf(value)) {
        layout.showKind(kind);
      }
    },
    [layout],
  );
  return <ChoiceGroup choices={choices} label={TEXT.kind} onChoose={handleChoose} value={props.value} />;
}
