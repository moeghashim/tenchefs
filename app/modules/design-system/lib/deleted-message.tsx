import type { ReactNode } from "react";

const TEXT = "Message deleted";

export function DeletedMessage(): ReactNode {
  return (
    <p className="px-5 py-1.5 text-sm text-muted-foreground italic" data-deleted-message>
      {TEXT}
    </p>
  );
}
