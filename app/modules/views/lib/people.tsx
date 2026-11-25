import { Chip, FilterField } from "../../design-system/controls.tsx";
import type { Identity, IdentityName } from "../../sdk/index.ts";
import type { KindChoice, Layout } from "../../layout/index.ts";
import { Pane, PaneHeader, Toolbar } from "../../design-system/layout.tsx";
import type { Identities } from "../../composer/index.ts";
import type { Keymap } from "../../keymap/index.ts";
import { KindFilter } from "./kind-filter.tsx";
import { PeopleRows } from "./people-rows.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const TEXT = { deactivated: "Show deactivated", filter: "Filter by name", title: "People & agents" } as const;

interface PeopleProps {
  readonly identities: Identities;
  readonly keymap: Keymap;
  readonly layout: Layout;
  readonly me: IdentityName;
  readonly open: IdentityName | null;
}

function ofKind(listed: readonly Identity[], kind: KindChoice): readonly Identity[] {
  return listed.filter((identity) => kind === "all" || identity.kind === kind);
}

function active(listed: readonly Identity[], showDeactivated: boolean): readonly Identity[] {
  return listed.filter((identity) => showDeactivated || identity.deactivated !== true);
}

function named(listed: readonly Identity[], filter: string): readonly Identity[] {
  const text = filter.trim().toLowerCase();
  return listed.filter((identity) =>
    [identity.name, identity.displayName ?? ""].some((each) => each.toLowerCase().includes(text)),
  );
}

function countsOf(listed: readonly Identity[]): Readonly<Record<KindChoice, number>> {
  return {
    agent: ofKind(listed, "agent").length,
    all: listed.length,
    human: ofKind(listed, "human").length,
  };
}

export function PeopleView(props: PeopleProps): ReactNode {
  const { layout } = props;
  const everyone = useSyncExternalStore(props.identities.subscribe, props.identities.snapshot);
  const state = useSyncExternalStore(layout.subscribe, layout.snapshot);
  const listed = active(everyone, state.showDeactivated);
  const matching = named(listed, state.identityFilter);
  const shown = ofKind(matching, state.identityKind);
  const handleEdit = layout.filterIdentities;
  const handleToggle = layout.toggleDeactivated;
  return (
    <Pane>
      <PaneHeader description={`${String(listed.length)} identities`} sans title={TEXT.title} />
      <Toolbar>
        <FilterField label={TEXT.filter} onEdit={handleEdit} value={state.identityFilter} />
        <KindFilter counts={countsOf(matching)} layout={layout} value={state.identityKind} />
        <Chip onClick={handleToggle} pressed={state.showDeactivated}>
          {TEXT.deactivated}
        </Chip>
      </Toolbar>
      <PeopleRows keymap={props.keymap} listed={everyone} me={props.me} open={props.open} shown={shown} />
    </Pane>
  );
}
