import { Form, SubmitButton, TextField } from "../../design-system/controls.tsx";
import type { ApprovalCode } from "../../board/index.ts";
import type { ReactNode } from "react";

const TEXT = {
  button: "Show",
  field: "Code",
  form: "Find a request by its code",
} as const;

interface ApprovalCodeFormProps {
  readonly approvalCode: ApprovalCode;
}

export function ApprovalCodeForm(props: ApprovalCodeFormProps): ReactNode {
  const handleType = props.approvalCode.type;
  return (
    <Form field="code" label={TEXT.form} onSubmit={handleType}>
      <TextField focused kind="text" label={TEXT.field} name="code" />
      <SubmitButton>{TEXT.button}</SubmitButton>
    </Form>
  );
}
