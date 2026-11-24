import { IdentityCard, Mention } from "../../design-system/index.tsx";
import type { ReactNode } from "react";
import { isIdentityName } from "../../identities/index.ts";
import { useProfileHref } from "./profile-base.ts";

interface MarkdownMentionProps {
  readonly "data-mention"?: string | undefined;
  readonly "data-name"?: string | undefined;
  readonly children?: ReactNode | undefined;
}

export function MarkdownMention(props: MarkdownMentionProps): ReactNode {
  const name = props["data-name"] ?? "";
  const profileOf = useProfileHref();
  const mention = <Mention mine={props["data-mention"] === "mine"}>{props.children}</Mention>;
  if (!isIdentityName(name)) {
    return mention;
  }
  return (
    <IdentityCard name={name}>
      <a className="hover:underline" href={profileOf(name)}>
        {mention}
      </a>
    </IdentityCard>
  );
}
