import { FoldEnd } from "./fold-end.tsx";
import type { MessageBodyParts } from "./parts.ts";
import type { ReactNode } from "react";
import { useFoldedBody } from "./use-folded-body.ts";

const SHOWN = "message-text text-[14.5px] leading-relaxed break-words";
const MEASURED = `${SHOWN} max-h-[12lh] overflow-hidden`;
const FOLDED = `${SHOWN} relative max-h-[8lh] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]`;

function bodyClass(foldable: boolean, folded: boolean): string {
  if (folded) {
    return FOLDED;
  }
  if (foldable) {
    return MEASURED;
  }
  return SHOWN;
}

export function MessageBody(parts: MessageBodyParts): ReactNode {
  const { body, folded } = useFoldedBody(parts.foldable);
  const handleUnfold = parts.onUnfold;
  return (
    <div className={bodyClass(parts.foldable, folded)} data-folded={folded} ref={body}>
      {parts.children}
      {folded && <FoldEnd onUnfold={handleUnfold} />}
    </div>
  );
}
