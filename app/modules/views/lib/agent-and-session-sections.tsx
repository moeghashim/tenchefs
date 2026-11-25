import type { Identities } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { LogOutButton } from "./log-out-button.tsx";
import { MyAgents } from "./my-agents.tsx";
import { PageSection } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { SettingsSection } from "../../paths/index.ts";
import { hrefOf } from "../../paths/index.ts";

const TEXT = { agents: "My agents", session: "Session" } as const;

interface AgentAndSessionSectionsProps {
  readonly identities: Identities;
  readonly me: IdentityName;
  readonly onLogOut: () => void;
  readonly section: SettingsSection | null;
}

export function AgentAndSessionSections(props: AgentAndSessionSectionsProps): ReactNode {
  const { section } = props;
  return (
    <>
      <PageSection
        focused={section === "agents"}
        href={hrefOf({ name: "settings", section: "agents" })}
        label={TEXT.agents}
      >
        <MyAgents identities={props.identities} me={props.me} />
      </PageSection>
      <PageSection
        focused={section === "session"}
        href={hrefOf({ name: "settings", section: "session" })}
        label={TEXT.session}
      >
        <LogOutButton onLogOut={props.onLogOut} />
      </PageSection>
    </>
  );
}
