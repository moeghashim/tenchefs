import type { IdentityCardShownParts } from "./identity-card-parts.ts";
import type { ReactNode } from "react";
import { initialsOf } from "./avatar-look.ts";
import { useAvatarImage } from "./use-avatar-image.ts";

export function IdentityCardFace(parts: IdentityCardShownParts): ReactNode {
  const { card } = parts;
  const { image, onError } = useAvatarImage(card.name);
  const handleError = onError;
  if (image === null) {
    return (
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center text-[88px] leading-none font-semibold tracking-tight text-white drop-shadow-sm select-none before:content-[attr(data-initials)]"
        data-agent={card.agent}
        data-deactivated={card.deactivated}
        data-initials={initialsOf(card.name)}
        data-testid="avatar"
      />
    );
  }
  return (
    <img
      alt={image.alt}
      className="absolute inset-0 h-full w-full object-cover"
      data-agent={card.agent}
      data-deactivated={card.deactivated}
      data-testid="avatar"
      decoding="async"
      onError={handleError}
      src={image.src}
    />
  );
}
