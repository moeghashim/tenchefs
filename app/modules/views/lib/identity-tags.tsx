import type { Identity } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { Tag } from "../../design-system/content.tsx";
import { handledCommands } from "../../identities/client.ts";

const TEXT = { admin: "admin", agent: "agent", handlerFor: "Handler for /" } as const;

interface IdentityTagsProps {
  readonly identity: Identity;
}

export function IdentityTags(props: IdentityTagsProps): ReactNode {
  const { identity } = props;
  return (
    <>
      {identity.kind === "agent" && <Tag label={TEXT.agent} />}
      {identity.admin && <Tag label={TEXT.admin} />}
      {handledCommands(identity).map((command) => (
        <Tag key={command} label={`${TEXT.handlerFor}${command}`} />
      ))}
    </>
  );
}
