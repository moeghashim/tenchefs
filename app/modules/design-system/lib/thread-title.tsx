import type { ReactNode } from "react";

interface ThreadTitleParts {
  readonly title: string;
}

export function ThreadTitle(parts: ThreadTitleParts): ReactNode {
  return (
    <h3 className="mb-2.5 basis-full text-[17px] leading-snug font-semibold break-words tracking-[-0.01em]">
      {parts.title}
    </h3>
  );
}
