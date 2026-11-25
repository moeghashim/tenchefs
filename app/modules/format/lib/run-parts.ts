interface RunAt {
  readonly iso: string;
  readonly timeZone: string;
}

interface RunParts {
  readonly date: string;
  readonly time: string;
}

const DATE_SHAPE = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
const TIME_SHAPE = { hour: "2-digit", hourCycle: "h23", minute: "2-digit" } as const;

function runPartsIn(run: RunAt): RunParts {
  const { timeZone } = run;
  const at = new Date(run.iso);
  return {
    date: new Intl.DateTimeFormat("en-CA", { ...DATE_SHAPE, timeZone }).format(at),
    time: new Intl.DateTimeFormat("en-GB", { ...TIME_SHAPE, timeZone }).format(at),
  };
}

export { runPartsIn };
