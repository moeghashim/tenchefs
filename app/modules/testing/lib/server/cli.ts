import { Option, Schema } from "effect";

const parseJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

function parseLine(line: unknown): unknown {
  return Option.getOrElse(parseJson(String(line)), () => line);
}

export { parseLine };
