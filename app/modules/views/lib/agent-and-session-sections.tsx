import type { Identities } from "../../composer/index.ts";
import type { IdentityName } from "../../sdk/index.ts";
import { MyAgents } from "./my-agents.tsx";
import { PageSection } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { SessionList } from "../../board/index.ts";
import { SessionsSection } from "./sessions-section.tsx";
import type { SettingsSection } from "../../paths/index.ts";
import { hrefOf } from "../../paths/index.ts";

const TEXT = { agents: "My agents", session: "Sessions" } as const;

interface AgentAndSessionSectionsProps {
  readonly identities: Identities;
  readonly me: IdentityName;
  readonly onLogOut: () => void;
  readonly section: SettingsSection | null;
  readonly sessionList: SessionList;
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
        <SessionsSection onLogOut={props.onLogOut} sessionList={props.sessionList} />
      </PageSection>
    </>
  );
}
