import { hueOf, initialsOf } from "./avatar-look.ts";
import type { ReactNode } from "react";
import { useAvatarImage } from "./use-avatar-image.ts";

const SIZES = {
  large: { box: "h-14 w-14 text-lg", testId: "avatar" },
  small: { box: "h-8 w-8 text-xs", testId: "avatar" },
  tiny: { box: "h-5 w-5 text-[9px] ring-2 ring-background", testId: "replier-avatar" },
} as const;

interface AvatarFaceParts {
  readonly name: string;
  readonly agent: boolean;
  readonly size: keyof typeof SIZES;
}

function shapeOf(agent: boolean): string {
  if (agent) {
    return "rounded-[28%]";
  }
  return "rounded-full";
}

export function AvatarFace(parts: AvatarFaceParts): ReactNode {
  const { image, onError } = useAvatarImage(parts.name);
  const handleError = onError;
  const shape = shapeOf(parts.agent);
  const size = SIZES[parts.size];
  if (image === null) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center font-semibold text-white select-none before:content-[attr(data-initials)] ${size.box} ${shape} ${hueOf(parts.name)}`}
        data-agent={parts.agent}
        data-initials={initialsOf(parts.name)}
        data-testid={size.testId}
      />
    );
  }
  return (
    <img
      alt={image.alt}
      className={`object-cover ${size.box} ${shape}`}
      data-agent={parts.agent}
      data-testid={size.testId}
      decoding="async"
      onError={handleError}
      src={image.src}
    />
  );
}
