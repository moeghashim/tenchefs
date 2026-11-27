import { AgentAndSessionSections } from "./agent-and-session-sections.tsx";
import type { Composer } from "../../composer/index.ts";
import { DisplayNames } from "./display-names.tsx";
import type { IdentityName } from "../../sdk/index.ts";
import type { Layout } from "../../layout/index.ts";
import { PageSection } from "../../design-system/layout.tsx";
import type { ReactNode } from "react";
import type { SessionList } from "../../board/index.ts";
import type { SettingsSection } from "../../paths/index.ts";
import { ThemeChoice } from "./theme-choice.tsx";
import { hrefOf } from "../../paths/index.ts";

const TEXT = { profile: "Profile", theme: "Theme" } as const;

interface SettingsSectionsProps {
  readonly composer: Composer;
  readonly layout: Layout;
  readonly me: IdentityName;
  readonly section: SettingsSection | null;
  readonly onLogOut: () => void;
  readonly sessionList: SessionList;
}

export function SettingsSections(props: SettingsSectionsProps): ReactNode {
  const { composer, me, section } = props;
  return (
    <>
      <PageSection
        focused={section === "profile"}
        href={hrefOf({ name: "settings", section: "profile" })}
        label={TEXT.profile}
      >
        <DisplayNames composer={composer} me={me} />
      </PageSection>
      <PageSection
        focused={section === "theme"}
        href={hrefOf({ name: "settings", section: "theme" })}
        label={TEXT.theme}
      >
        <ThemeChoice layout={props.layout} />
      </PageSection>
      <AgentAndSessionSections
        identities={composer.identities}
        me={me}
        onLogOut={props.onLogOut}
        section={section}
        sessionList={props.sessionList}
      />
    </>
  );
}
