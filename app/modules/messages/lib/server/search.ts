import { Array as Arr, Effect, Option, Predicate } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { SearchQuerySchema, SearchResponseSchema, cursorText } from "./search-wire.ts";
import type { Route } from "../../../http/server.ts";
import type { SearchPageRequest } from "../../../storage/server.ts";
import type { SearchResponse } from "../../../search/index.ts";
import { Storage } from "../../../storage/server.ts";
import { pageSize } from "../../index.ts";
import { searchPath } from "../../../search/index.ts";
import { searchQueryOf } from "./search-query.ts";

const ALL_ERRORS = { errors: "all" } as const;
const PATH_BASE = "http://cookout.invalid";

type Query = typeof SearchQuerySchema.Type;

const FIRST_RESULT = 0;

function pageRequest(query: Query): SearchPageRequest {
  const limit = query.limit ?? pageSize.default;
  if (query.sort === "best") {
    return { limit, offset: query.cursor ?? FIRST_RESULT, sort: "best" };
  }
  if (Predicate.isUndefined(query.cursor)) {
    return { limit };
  }
  return { after: query.cursor, limit };
}

function cursorAfter(page: SearchPageRequest, stored: Pick<SearchResponse, "hasMore" | "results">): string | null {
  const last = Arr.last(stored.results);
  if (!stored.hasMore || Option.isNone(last)) {
    return null;
  }
  if (page.sort === "best") {
    return String(page.offset + stored.results.length);
  }
  const { createdAt, id } = last.value.message;
  return cursorText({ createdAt, id });
}

const searchRoute: Route<Storage> = {
  handle: () =>
    Effect.gen(function* searchRouteHandler() {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const search = HttpServerRequest.searchParamsFromURL(new URL(request.url, PATH_BASE));
      const query = yield* HttpServerRequest.schemaSearchParams(SearchQuerySchema, ALL_ERRORS).pipe(
        Effect.provideService(HttpServerRequest.ParsedSearchParams, search),
      );
      const searched = yield* searchQueryOf(query.query);
      const storage = yield* Storage;
      const page = pageRequest(query);
      const stored = yield* storage.searchMessages(searched, page);
      return yield* HttpServerResponse.schemaJson(SearchResponseSchema)({
        ...stored,
        cursor: cursorAfter(page, stored),
      });
    }),
  method: "GET",
  path: searchPath,
};

export const searchRoutes: readonly Route<Storage>[] = [searchRoute];

export { SearchResponseSchema } from "./search-wire.ts";
