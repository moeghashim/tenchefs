import { Button, ButtonRow } from "../../design-system/controls.tsx";
import { CardBody } from "../../design-system/layout.tsx";
import { Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";

const TEXT = { again: "Start again", back: "Back", expired: "That code expired before anyone approved it." } as const;

interface WebLoginExpiredProps {
  readonly onBack: () => void;
  readonly onStart: () => void;
}

export function WebLoginExpired(props: WebLoginExpiredProps): ReactNode {
  const handleBack = props.onBack;
  const handleStart = props.onStart;
  return (
    <CardBody>
      <Muted>{TEXT.expired}</Muted>
      <ButtonRow>
        <Button focused onClick={handleStart}>
          {TEXT.again}
        </Button>
        <Button onClick={handleBack}>{TEXT.back}</Button>
      </ButtonRow>
    </CardBody>
  );
}
