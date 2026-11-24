import type { ReactNode } from "react";

interface MarkdownLinkProps {
  readonly href?: string | undefined;
  readonly children?: ReactNode | undefined;
}

type Target = "_blank" | "_self";

function isThisBoard(href: string | undefined): boolean {
  const here = globalThis.location;
  return typeof href === "string" && URL.canParse(href, here.href) && new URL(href, here.href).origin === here.origin;
}

function targetOf(href: string | undefined): Target {
  if (isThisBoard(href)) {
    return "_self";
  }
  return "_blank";
}

export function MarkdownLink(props: MarkdownLinkProps): ReactNode {
  return (
    <a
      className="text-foreground underline underline-offset-2"
      href={props.href}
      rel="noopener noreferrer"
      target={targetOf(props.href)}
    >
      {props.children}
    </a>
  );
}
