import { DaySeparator } from "./day-separator.tsx";
import { ItemArticle } from "./item-article.tsx";
import type { MessageItemParts } from "./message-parts.ts";
import { NewLine } from "./new-line.tsx";
import type { ReactNode } from "react";

export function MessageItem(parts: MessageItemParts): ReactNode {
  return (
    <div className="flex flex-col">
      {parts.day !== null && <DaySeparator label={parts.day} />}
      {parts.unreadLine && <NewLine />}
      <ItemArticle message={parts} />
    </div>
  );
}
