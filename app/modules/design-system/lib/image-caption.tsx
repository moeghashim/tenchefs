import { Description, Title } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface ImageCaptionParts {
  readonly name: string;
  readonly detail: string;
}

export function ImageCaption(parts: ImageCaptionParts): ReactNode {
  return (
    <figcaption className="flex max-w-[calc(100vw-2rem)] items-baseline gap-2 rounded-md bg-background px-2.5 py-1 text-xs shadow">
      <Title asChild>
        <span className="truncate font-medium text-foreground">{parts.name}</span>
      </Title>
      <Description asChild>
        <span className="shrink-0 text-muted-foreground">{parts.detail}</span>
      </Description>
    </figcaption>
  );
}
