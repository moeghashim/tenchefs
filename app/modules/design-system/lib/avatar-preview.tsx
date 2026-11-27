import type { ReactNode } from "react";

interface AvatarPreviewParts {
  readonly agent: boolean;
  readonly alt: string;
  readonly src: string;
}

function shapeOf(agent: boolean): string {
  if (agent) {
    return "rounded-[28%]";
  }
  return "rounded-full";
}

export function AvatarPreview(parts: AvatarPreviewParts): ReactNode {
  return <img alt={parts.alt} className={`h-14 w-14 object-cover ${shapeOf(parts.agent)}`} src={parts.src} />;
}
