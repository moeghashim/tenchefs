import { Description, Title } from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

interface FormDialogTextParts {
  readonly title: string;
  readonly description: string;
}

export function FormDialogText(parts: FormDialogTextParts): ReactNode {
  return (
    <div className="grid gap-1">
      <Title asChild>
        <h2 className="text-sm font-semibold text-foreground">{parts.title}</h2>
      </Title>
      <Description asChild>
        <p className="text-xs text-muted-foreground">{parts.description}</p>
      </Description>
    </div>
  );
}
