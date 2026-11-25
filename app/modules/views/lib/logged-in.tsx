import { LinkList, LinkRow, Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { hrefOf } from "../../paths/index.ts";

const TEXT = { inbox: "See the inbox", next: "Next" } as const;

interface LoggedInProps {
  readonly name: string;
}

export function LoggedIn(props: LoggedInProps): ReactNode {
  return (
    <LinkList label={TEXT.next}>
      <LinkRow href={hrefOf({ name: "inbox", selected: null })}>
        <Muted>{`Logged in as @${props.name}.`}</Muted>
        <span className="text-sm">{TEXT.inbox}</span>
      </LinkRow>
    </LinkList>
  );
}
