import { parse } from "yaml";

interface WorkflowFile {
  readonly path: string;
  readonly text: string;
}

interface Step {
  readonly name: string;
  readonly ref: string;
  readonly run: string;
  readonly uses: string;
  readonly withPath: string;
}

const LOCAL_ACTION = "./.github/actions/";
const CHECKOUT = "actions/checkout@";
const WORKFLOW_SHA = `\${{ github.workflow_sha }}`;
const RESTORE_NAME = "Local actions from the workflow's commit";
const RESTORE_RUN =
  'git cat-file -e "$WORKFLOW_SHA^{commit}" 2>/dev/null || git fetch --quiet --depth=1 origin "$WORKFLOW_SHA"\nrm -rf .github/actions\ngit checkout "$WORKFLOW_SHA" -- .github/actions';
const ADR = "docs/adr/0122-local-actions-come-from-the-workflows-own-commit.md";
const FIRST = 1;

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function textOf(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function stepOf(value: unknown): Step {
  const step = recordOf(value);
  const inputs = recordOf(step["with"]);
  return {
    name: textOf(step["name"]),
    ref: textOf(inputs["ref"]),
    run: textOf(step["run"]),
    uses: textOf(step["uses"]),
    withPath: textOf(inputs["path"]),
  };
}

function checksOutAnotherCommit(step: Step): boolean {
  return step.uses.startsWith(CHECKOUT) && step.withPath === "" && step.ref !== "" && step.ref !== WORKFLOW_SHA;
}

function restores(step: Step): boolean {
  return step.name === RESTORE_NAME && step.run === RESTORE_RUN;
}

function stepsOf(job: unknown): readonly Step[] {
  const { steps } = recordOf(job);
  if (!Array.isArray(steps)) {
    return [];
  }
  return steps.map((step) => stepOf(step));
}

function foreignAfter(foreign: string, step: Step): string {
  if (checksOutAnotherCommit(step)) {
    return step.ref;
  }
  if (restores(step)) {
    return "";
  }
  return foreign;
}

function jobFindings(path: string, name: string, steps: readonly Step[]): readonly string[] {
  const findings: string[] = [];
  let foreign = "";
  for (const [index, step] of steps.entries()) {
    if (foreign !== "" && step.uses.startsWith(LOCAL_ACTION)) {
      findings.push(
        `${path}: job ${name}, step ${index + FIRST} uses ${step.uses} from the commit it checked out (ref: ${foreign}), not from the workflow's own commit. Add the step "${RESTORE_NAME}" right after the checkout (${ADR}).`,
      );
    }
    foreign = foreignAfter(foreign, step);
  }
  return findings;
}

function fileFindings(file: WorkflowFile): readonly string[] {
  const jobs = recordOf(recordOf(parse(file.text))["jobs"]);
  return Object.entries(jobs).flatMap(([name, job]: readonly [string, unknown]) =>
    jobFindings(file.path, name, stepsOf(job)),
  );
}

function mixedLocalActions(files: readonly WorkflowFile[]): readonly string[] {
  return files.flatMap((file) => fileFindings(file));
}

export { mixedLocalActions };
