import type { JsonValue, SchemaProblem } from "../../sdk/index.ts";
import { CookoutError } from "../../sdk/index.ts";
import { failure } from "./failure.ts";

interface CallFailure {
  readonly status: "failed";
  readonly webhookCommand: string;
  readonly code: string;
  readonly message: string;
  readonly problems: readonly SchemaProblem[];
}

type CallState =
  | { readonly status: "idle" }
  | { readonly status: "calling"; readonly webhookCommand: string }
  | { readonly status: "called"; readonly webhookCommand: string }
  | CallFailure;

type ParsedData = { readonly status: "json"; readonly data: JsonValue } | { readonly status: "not-json" };

interface CallRequest {
  readonly webhookCommand: string;
  readonly data: string;
  readonly called: () => void;
  readonly refused: (() => void) | null;
}

interface Refused {
  readonly webhookCommand: string;
  readonly error: unknown;
}

const NOT_JSON: ParsedData = { status: "not-json" };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function primitiveOf(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function toJson(value: unknown): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => toJson(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]: readonly [string, unknown]) => [key, toJson(item)]),
    );
  }
  return primitiveOf(value);
}

function parseData(text: string): ParsedData {
  try {
    const json: unknown = JSON.parse(text);
    return { data: toJson(json), status: "json" };
  } catch {
    return NOT_JSON;
  }
}

function notJson(command: string): CallFailure {
  return {
    code: "invalid_json",
    message: "The data isn't JSON.",
    problems: [],
    status: "failed",
    webhookCommand: command,
  };
}

function problemsIn(error: unknown): readonly SchemaProblem[] {
  if (error instanceof CookoutError) {
    return error.schemaProblems;
  }
  return [];
}

function callFailure(refused: Refused): CallFailure {
  const { code, message } = failure(refused.error);
  return {
    code,
    message,
    problems: problemsIn(refused.error),
    status: "failed",
    webhookCommand: refused.webhookCommand,
  };
}

export { type CallRequest, type CallState, callFailure, notJson, parseData };
