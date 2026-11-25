import { FooterLink } from "../../design-system/layout.tsx";
import type { Identity } from "../../sdk/index.ts";
import { IdentityLink } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import type { Route } from "../../paths/index.ts";
import { hrefOf } from "../../paths/index.ts";
import { useListed } from "./use-author.ts";
import { usePresence } from "./use-presence.ts";

const TEXT = { settings: "Settings" } as const;

interface SidebarSettingsProps {
  readonly identity: Identity;
  readonly route: Route;
}

export function SidebarSettings(props: SidebarSettingsProps): ReactNode {
  const { identity, route } = props;
  const listed = useListed(identity.name) ?? identity;
  return (
    <>
      <IdentityLink
        active={route.name === "profile" && route.identity === identity.name}
        agent={identity.kind === "agent"}
        displayName={listed.displayName ?? null}
        href={hrefOf({ identity: identity.name, name: "profile" })}
        name={identity.name}
        presence={usePresence(identity.name)}
      />
      <FooterLink active={route.name === "settings"} href={hrefOf({ name: "settings", section: null })}>
        {TEXT.settings}
      </FooterLink>
    </>
  );
}
