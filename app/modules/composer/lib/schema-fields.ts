import type { JsonSchema, JsonValue } from "../../sdk/index.ts";

type FieldKind = "checkbox" | "integer" | "number" | "pick" | "text";
type Choice = string | number | boolean;

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

const JSON_BOX: Prompt = { kind: "json" };
const NO_FIELDS: readonly PromptField[] = [];
const KINDS: Readonly<Partial<Record<string, FieldKind>>> = {
  boolean: "checkbox",
  integer: "integer",
  number: "number",
  string: "text",
};
const ONE = 1;
const CHOICE_TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean"]);

function isObject(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isChoice(value: unknown): value is Choice {
  return CHOICE_TYPES.has(typeof value);
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  return null;
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

function inlineField(schema: JsonSchema): string | null {
  const fields = fieldsOf(promptOf(schema));
  let inline: string | null = null;
  for (const field of fields.filter((only) => fields.length === ONE && only.kind === "text")) {
    inline = field.name;
  }
  return inline;
}

export { type Prompt, type PromptField, fieldsOf, inlineField, promptOf };
