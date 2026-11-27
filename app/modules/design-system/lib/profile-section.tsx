import type { ReactNode } from "react";
import { useId } from "react";

interface ProfileSectionParts {
  readonly label: string;
  readonly children: ReactNode;
}

export function ProfileSection(parts: ProfileSectionParts): ReactNode {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-t pt-4">
      <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase" id={id}>
        {parts.label}
      </h4>
      {parts.children}
    </section>
  );
}
