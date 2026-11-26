import { CardBody } from "../../design-system/layout.tsx";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";
import { useLayoutEffect } from "react";

const TEXT = { gone: "This thread was deleted" } as const;

interface ThreadGoneProps {
  readonly landing: string;
}

function isLost(): boolean {
  const { activeElement, body } = globalThis.document;
  return activeElement === null || activeElement === body;
}

export function ThreadGone(props: ThreadGoneProps): ReactNode {
  const { landing } = props;
  useLayoutEffect(() => {
    const element = globalThis.document.querySelector(landing);
    if (isLost() && element instanceof HTMLElement) {
      element.focus();
    }
  }, [landing]);
  return (
    <CardBody>
      <Muted>{TEXT.gone}</Muted>
    </CardBody>
  );
}
