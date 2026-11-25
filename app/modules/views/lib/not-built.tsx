import { Card, CardHeader } from "../../design-system/layout.tsx";
import { Heading, Muted } from "../../design-system/content.tsx";
import type { ReactNode } from "react";

interface NotBuiltProps {
  readonly title: string;
  readonly description: string;
}

export function NotBuiltView(props: NotBuiltProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <Heading>{props.title}</Heading>
        <Muted>{props.description}</Muted>
      </CardHeader>
    </Card>
  );
}
