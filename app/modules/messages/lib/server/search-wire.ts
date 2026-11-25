import { ListMessagesQuerySchema, MessageIdSchema, MessageSchema } from "./wire.ts";
import { Schema, SchemaTransformation, String as Str } from "effect";
import type { SearchResponse, SearchResult } from "../../../search/index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { matchesWire } from "../../../http/index.ts";
import { searchQueryParam } from "../../client.ts";

const SEPARATOR = "_";

const CursorPartsSchema = Schema.Struct({ createdAt: IsoTimeSchema, id: MessageIdSchema });

type CursorParts = typeof CursorPartsSchema.Encoded;

function cursorText({ createdAt, id }: CursorParts): string {
  return `${createdAt}${SEPARATOR}${String(id)}`;
}

const SearchCursorSchema = Schema.String.pipe(
  Schema.decodeTo(
    CursorPartsSchema,
    SchemaTransformation.transform({
      decode: (text: string) => {
        const [createdAt, id = ""] = Str.split(text, SEPARATOR);
        return { createdAt, id: Number(id) };
      },
      encode: cursorText,
    }),
  ),
);

const FIRST_RESULT = 0;

const OffsetSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(FIRST_RESULT));

const OffsetCursorSchema = Schema.FiniteFromString.pipe(Schema.decodeTo(OffsetSchema));

const NewestQuerySchema = Schema.Struct({
  cursor: Schema.optionalKey(SearchCursorSchema),
  limit: ListMessagesQuerySchema.fields.limit,
  query: Schema.String,
  sort: Schema.optionalKey(Schema.Literal("newest")),
}).pipe(Schema.encodeKeys({ query: searchQueryParam }));

const BestQuerySchema = Schema.Struct({
  cursor: Schema.optionalKey(OffsetCursorSchema),
  limit: ListMessagesQuerySchema.fields.limit,
  query: Schema.String,
  sort: Schema.Literal("best"),
}).pipe(Schema.encodeKeys({ query: searchQueryParam }));

const SearchQuerySchema = Schema.Union([NewestQuerySchema, BestQuerySchema]);

const SearchResultSchema = matchesWire<SearchResult>()(
  Schema.Struct({ message: MessageSchema, threadClosed: Schema.Boolean }),
);

const SearchResponseSchema = matchesWire<SearchResponse>()(
  Schema.Struct({
    cursor: Schema.NullOr(Schema.String),
    hasMore: Schema.Boolean,
    results: Schema.Array(SearchResultSchema),
  }),
);

export { SearchQuerySchema, SearchResponseSchema, cursorText };
