const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEK = 7;
const TWO = 2;
const FIELDS = 5;
const MINUTE = 0;
const HOUR = 1;
const DAY = 2;
const MONTH = 3;
const WEEKDAY = 4;
const WHOLE = /^\d+$/u;
const STEP = "*/";
const NAMED_DAYS: Readonly<Record<string, string>> = { "*": "Every day", "0,6": "Weekends", "1-5": "Weekdays" };

interface Fields {
  readonly minute: string;
  readonly hour: string;
  readonly day: string;
  readonly month: string;
  readonly weekday: string;
}

function fieldAt(parts: readonly string[], index: number): string {
  return parts[index] ?? "";
}

function fieldsOf(cron: string): Fields | null {
  const parts = cron.trim().split(/\s+/u);
  if (parts.length !== FIELDS) {
    return null;
  }
  return {
    day: fieldAt(parts, DAY),
    hour: fieldAt(parts, HOUR),
    minute: fieldAt(parts, MINUTE),
    month: fieldAt(parts, MONTH),
    weekday: fieldAt(parts, WEEKDAY),
  };
}

function clockOf({ hour, minute }: Fields): string | null {
  if (!WHOLE.test(hour) || !WHOLE.test(minute)) {
    return null;
  }
  return `${hour.padStart(TWO, "0")}:${minute.padStart(TWO, "0")}`;
}

function dayName(part: string): string | null {
  if (!WHOLE.test(part)) {
    return null;
  }
  return DAYS[Number(part) % WEEK] ?? null;
}

function weekdaysOf(weekday: string): string | null {
  const named = NAMED_DAYS[weekday] ?? null;
  if (named !== null) {
    return named;
  }
  const names = weekday.split(",").map((part) => dayName(part));
  if (names.includes(null)) {
    return null;
  }
  return `Every ${names.join(" and ")}`;
}

function daysOf({ day, month, weekday }: Fields): string | null {
  if (month !== "*") {
    return null;
  }
  if (day === "*") {
    return weekdaysOf(weekday);
  }
  if (WHOLE.test(day) && weekday === "*") {
    return `On day ${day} of every month`;
  }
  return null;
}

function repeatingOf(fields: Fields): string | null {
  const rest = [fields.hour, fields.day, fields.month, fields.weekday];
  if (!rest.every((part) => part === "*")) {
    return null;
  }
  const minutes = fields.minute.slice(STEP.length);
  if (fields.minute.startsWith(STEP) && WHOLE.test(minutes)) {
    return `Every ${minutes} minutes`;
  }
  if (WHOLE.test(fields.minute)) {
    return `Every hour at ${fields.minute.padStart(TWO, "0")} minutes past`;
  }
  return null;
}

export function cronWords(cron: string): string | null {
  const fields = fieldsOf(cron);
  if (fields === null) {
    return null;
  }
  const clock = clockOf(fields);
  const days = daysOf(fields);
  if (clock === null || days === null) {
    return repeatingOf(fields);
  }
  return `${days} at ${clock}`;
}
