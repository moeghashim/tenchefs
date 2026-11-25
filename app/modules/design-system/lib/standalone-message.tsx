import { DaySeparator } from "./day-separator.tsx";
import type { ReactNode } from "react";
import { StandaloneArticle } from "./standalone-article.tsx";
import type { StandaloneMessageParts } from "./message-parts.ts";

export function StandaloneMessage(parts: StandaloneMessageParts): ReactNode {
  return (
    <>
      {parts.day !== null && <DaySeparator label={parts.day} />}
      <StandaloneArticle message={parts} />
    </>
  );
}
