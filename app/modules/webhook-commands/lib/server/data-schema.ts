import { Array as Arr, Option, Result, String as Str, pipe } from "effect";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { JsonSchema } from "../../index.ts";
import type { JsonValue } from "../../../messages/index.ts";
import addFormats from "ajv-formats";
import draft07 from "ajv/dist/refs/json-schema-draft-07.json" with { type: "json" };

interface DataError {
  readonly message: string;
  readonly path: readonly string[];
}

interface AjvError {
  readonly instancePath: string;
  readonly message?: string;
}

type DataCheck = (data: JsonValue) => readonly DataError[];

const ROOT_SEGMENTS = 1;
const NO_MESSAGE = "is not allowed by the schema";

function segmentOf(escaped: string): string {
  return pipe(escaped, Str.replaceAll("~1", "/"), Str.replaceAll("~0", "~"));
}

function pathOf(instancePath: string): readonly string[] {
  return pipe(instancePath, Str.split("/"), Arr.drop(ROOT_SEGMENTS), Arr.map(segmentOf));
}

function dataErrorOf({ instancePath, message = NO_MESSAGE }: AjvError): DataError {
  return { message, path: pathOf(instancePath) };
}

function compileDataSchema(schema: JsonSchema): Result.Result<DataCheck, string> {
  const ajv = addFormats(new Ajv2020({ allErrors: true, logger: false, strict: false }));
  ajv.addMetaSchema(draft07);
  return Result.try({
    catch: String,
    try: (): DataCheck => {
      const validate = ajv.compile(schema);
      return (data) => {
        if (validate(data)) {
          return [];
        }
        return Arr.map(Option.getOrElse(Option.fromNullishOr(validate.errors), Arr.empty), dataErrorOf);
      };
    },
  });
}

export { type DataCheck, type DataError, compileDataSchema };
