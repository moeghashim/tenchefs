import type { JsonSchema, JsonValue, SchemaProblem } from "../../sdk/index.ts";
import type { CallState } from "../../board/index.ts";

type FieldKind = "checkbox" | "integer" | "number" | "pick" | "text";
type Choice = string | number | boolean;
type Typed = Readonly<Record<string, string | boolean>>;
type Entry = readonly [string, JsonValue];

interface PromptField {
  readonly name: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly help: string | null;
  readonly options: readonly string[];
  readonly choices: readonly Choice[];
}

type Prompt = { readonly kind: "fields"; readonly fields: readonly PromptField[] } | { readonly kind: "json" };

interface FieldOf {
  readonly name: string;
  readonly property: JsonValue;
  readonly required: readonly string[];
}

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

const JSON_BOX: Prompt = { kind: "json" };
const IDLE: CallState = { status: "idle" };
const NO_FIELDS: readonly PromptField[] = [];
const KINDS: Readonly<Partial<Record<string, FieldKind>>> = {
  boolean: "checkbox",
  integer: "integer",
  number: "number",
  string: "text",
};
const DATA = "data";
const PROPERTY_PATH = 2;
const ONE = 1;
const NONE = 0;

function isObject(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

const CHOICE_TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean"]);

function isChoice(value: unknown): value is Choice {
  return CHOICE_TYPES.has(typeof value);
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function textIn(typed: string | boolean | undefined): string {
  if (typeof typed === "string") {
    return typed;
  }
  return "";
}

function requiredIn(schema: JsonSchema): readonly string[] {
  const { required } = schema;
  if (!isList(required)) {
    return [];
  }
  return required.filter((name) => typeof name === "string");
}

function choicesIn(property: Readonly<Record<string, JsonValue>>): readonly Choice[] {
  const { enum: options } = property;
  if (!isList(options)) {
    return [];
  }
  return options.filter((option) => isChoice(option));
}

function kindOf(property: Readonly<Record<string, JsonValue>>): FieldKind | null {
  const { enum: options, type } = property;
  if (isList(options)) {
    if (options.every((option) => isChoice(option))) {
      return "pick";
    }
    return null;
  }
  if (typeof type !== "string") {
    return null;
  }
  return KINDS[type] ?? null;
}

function fieldOf({ name, property, required }: FieldOf): PromptField | null {
  if (!isObject(property)) {
    return null;
  }
  const kind = kindOf(property);
  if (kind === null) {
    return null;
  }
  const choices = choicesIn(property);
  const options = choices.map(String);
  return { choices, help: textOf(property["description"]), kind, name, options, required: required.includes(name) };
}

function fieldsIn(properties: Readonly<Record<string, JsonValue>>, required: readonly string[]): PromptField[] | null {
  const fields: PromptField[] = [];
  for (const [name, property] of Object.entries(properties)) {
    const field = fieldOf({ name, property, required });
    if (field === null) {
      return null;
    }
    fields.push(field);
  }
  return fields;
}

function promptOf(schema: JsonSchema): Prompt {
  const { properties } = schema;
  if (!isObject(properties)) {
    return JSON_BOX;
  }
  const fields = fieldsIn(properties, requiredIn(schema));
  if (fields === null) {
    return JSON_BOX;
  }
  return { fields, kind: "fields" };
}

function fieldsOf(prompt: Prompt): readonly PromptField[] {
  if (prompt.kind === "json") {
    return NO_FIELDS;
  }
  return prompt.fields;
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

export {
  type Prompt,
  type PromptField,
  type Typed,
  callDataOf,
  errorText,
  fieldErrors,
  fieldNamed,
  fieldsOf,
  promptOf,
  shownCall,
  textIn,
  typedIn,
};
