import { CardBody, ListArea, NavList } from "../../design-system/layout.tsx";
import type { Identity, IdentityName } from "../../sdk/index.ts";
import { Muted, Skeleton } from "../../design-system/content.tsx";
import type { Keymap } from "../../keymap/index.ts";
import { PersonRow } from "./person-row.tsx";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { usePeopleKeys } from "./use-people-keys.ts";

const NONE = 0;

const TEXT = { area: "People & agents", list: "Identities", none: "Nobody matches." } as const;

interface PeopleRowsProps {
  readonly keymap: Keymap;
  readonly listed: readonly Identity[];
  readonly shown: readonly Identity[];
  readonly me: IdentityName;
  readonly open: IdentityName | null;
}

export function PeopleRows(props: PeopleRowsProps): ReactNode {
  const { me, open, shown } = props;
  const names = useMemo(() => shown.map((identity) => identity.name), [shown]);
  const tabbable = usePeopleKeys({ keymap: props.keymap, open, shown: names });
  if (props.listed.length === NONE) {
    return (
      <CardBody>
        <Skeleton width="short" />
        <Skeleton width="long" />
      </CardBody>
    );
  }
  return (
    <ListArea label={TEXT.area}>
      {shown.length === NONE && (
        <CardBody>
          <Muted>{TEXT.none}</Muted>
        </CardBody>
      )}
      <NavList label={TEXT.list}>
        {shown.map((identity) => (
          <PersonRow
            identity={identity}
            key={identity.name}
            me={me}
            open={open}
            tabbable={identity.name === tabbable}
          />
        ))}
      </NavList>
    </ListArea>
  );
}
