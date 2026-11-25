import type { PendingAttachment } from "../../composer/index.ts";

const FIRST = 0;
const NEXT = 1;

interface Removing {
  readonly form: string;
  readonly key: number;
  readonly pending: readonly PendingAttachment[];
}

function removedFocus({ form, key, pending }: Removing): string {
  const shown = `form[aria-label="${CSS.escape(form)}"]`;
  const at = pending.findIndex((attachment) => attachment.key === key);
  const rest = pending.filter((attachment) => attachment.key !== key);
  const from = Math.max(FIRST, Math.min(at, rest.length - NEXT));
  const [next] = rest.slice(from).map(({ name }) => `${shown} button[aria-label="${CSS.escape(`Remove ${name}`)}"]`);
  return next ?? `${shown} textarea`;
}

export { removedFocus };
