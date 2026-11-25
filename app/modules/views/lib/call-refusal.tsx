import { Alert, ItemList, ItemRow } from "../../design-system/content.tsx";
import type { CallState, SchemaProblem } from "../../board/index.ts";
import type { PromptField } from "./prompt-fields.ts";
import type { ReactNode } from "react";
import { fieldNamed } from "./prompt-fields.ts";

const NONE = 0;

const TEXT = { problems: "Schema errors" } as const;

interface CallRefusalProps {
  readonly call: CallState;
  readonly fields: readonly PromptField[];
}

function problemText(problem: SchemaProblem): string {
  return `${problem.path.join(".")}: ${problem.message}`;
}

export function CallRefusal(props: CallRefusalProps): ReactNode {
  const { call, fields } = props;
  if (call.status !== "failed") {
    return null;
  }
  const problems = call.problems.filter((problem) => fieldNamed({ fields, problem }) === null);
  return (
    <Alert>
      {`Couldn't call /${call.command} (${call.code}): ${call.message}`}
      {problems.length > NONE && (
        <ItemList label={TEXT.problems}>
          {problems.map((problem) => (
            <ItemRow key={problemText(problem)}>{problemText(problem)}</ItemRow>
          ))}
        </ItemList>
      )}
    </Alert>
  );
}
