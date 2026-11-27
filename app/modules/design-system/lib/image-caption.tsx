import { Description, Title } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface ImageCaptionParts {
  readonly name: string;
  readonly detail: string;
  readonly at: number;
  readonly count: number;
}

const ONE = 1;

function counterOf({ at, count }: ImageCaptionParts): string {
  return `${String(at + ONE)} / ${String(count)}`;
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
      {parts.count > ONE && <output className="shrink-0 text-muted-foreground tabular-nums">{counterOf(parts)}</output>}
    </figcaption>
  );
}
