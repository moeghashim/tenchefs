import type { ReactNode } from "react";

interface Run {
  readonly iso: string;
  readonly text: string;
}

interface RunListParts {
  readonly label: string;
  readonly runs: readonly Run[];
}

export function RunList(parts: RunListParts): ReactNode {
  return (
    <ul aria-label={parts.label} className="grid gap-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
      {parts.runs.map((run) => (
        <li key={run.iso}>
          <time dateTime={run.iso}>{run.text}</time>
        </li>
      ))}
    </ul>
  );
}
