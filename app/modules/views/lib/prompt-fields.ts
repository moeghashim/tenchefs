import type { JsonValue, SchemaProblem } from "../../sdk/index.ts";
import type { Prompt, PromptField } from "../../composer/index.ts";
import type { CallState } from "../../board/index.ts";

type Typed = Readonly<Record<string, string | boolean>>;
type Entry = readonly [string, JsonValue];

interface Sent {
  readonly prompt: Prompt;
  readonly typed: Typed;
  readonly kept: string;
}

interface Named {
  readonly problem: SchemaProblem;
  readonly fields: readonly PromptField[];
}

interface Refused {
  readonly call: CallState;
  readonly fields: readonly PromptField[];
}

interface ShownOf {
  readonly call: CallState;
  readonly webhookCommand: string;
}

const IDLE: CallState = { status: "idle" };
const DATA = "data";
const PROPERTY_PATH = 2;
const ONE = 1;
const NONE = 0;

function isObject(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textIn(typed: string | boolean | undefined): string {
  if (typeof typed === "string") {
    return typed;
  }
  return "";
}

function parsed(kept: string): unknown {
  try {
    return JSON.parse(kept);
  } catch {
    return null;
  }
}

function typedIn(kept: string): Typed {
  const data = parsed(kept);
  const typed: Record<string, string | boolean> = {};
  if (!isObject(data)) {
    return typed;
  }
  for (const [name, value] of Object.entries(data)) {
    if (typeof value === "string" || typeof value === "boolean") {
      typed[name] = value;
    }
  }
  return typed;
}

function numberEntry(field: PromptField, typed: string | boolean | undefined): readonly Entry[] {
  const text = textIn(typed);
  if (text === "") {
    return [];
  }
  return [[field.name, Number(text)]];
}

function pickEntry(field: PromptField, typed: string | boolean | undefined): readonly Entry[] {
  const at = field.options.indexOf(textIn(typed));
  return field.choices.slice(at, at + ONE).map((choice) => [field.name, choice] as const);
}

function textEntry(field: PromptField, typed: string | boolean | undefined): readonly Entry[] {
  const text = textIn(typed);
  if (text === "" && !field.required) {
    return [];
  }
  return [[field.name, text]];
}

function checkboxEntry(field: PromptField, typed: string | boolean | undefined): readonly Entry[] {
  return [[field.name, typed === true]];
}

const ENTRIES = {
  checkbox: checkboxEntry,
  integer: numberEntry,
  number: numberEntry,
  pick: pickEntry,
  text: textEntry,
} as const;

function callDataOf({ kept, prompt, typed }: Sent): string {
  if (prompt.kind === "json") {
    return kept;
  }
  const entries = prompt.fields.flatMap((field) => ENTRIES[field.kind](field, typed[field.name]));
  return JSON.stringify(Object.fromEntries(entries));
}

function fieldNamed({ fields, problem }: Named): string | null {
  const [root, name] = problem.path;
  const named = root === DATA && problem.path.length === PROPERTY_PATH;
  let found: string | null = null;
  for (const field of fields.filter((shown) => named && shown.name === name)) {
    found = field.name;
  }
  return found;
}

function fieldErrors({ call, fields }: Refused): ReadonlyMap<string, readonly string[]> {
  const errors = new Map<string, readonly string[]>();
  if (call.status !== "failed") {
    return errors;
  }
  for (const problem of call.problems) {
    const name = fieldNamed({ fields, problem });
    if (name !== null) {
      errors.set(name, [...(errors.get(name) ?? []), problem.message]);
    }
  }
  return errors;
}

function errorText(messages: readonly string[]): string | null {
  if (messages.length === NONE) {
    return null;
  }
  return messages.join("; ");
}

function shownCall({ call, webhookCommand: command }: ShownOf): CallState {
  if (call.status === "idle" || call.webhookCommand !== command) {
    return IDLE;
  }
  return call;
}

export { type Prompt, type PromptField, fieldsOf, promptOf } from "../../composer/index.ts";
export { type Typed, callDataOf, errorText, fieldErrors, fieldNamed, shownCall, textIn, typedIn };
