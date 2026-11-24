import type { AssetStore, Storage } from "../../../storage/server.ts";
import { ListOpenThreadsResponseSchema, openThreadRoutes } from "./open-threads.ts";
import { SearchResponseSchema, searchRoutes } from "./search.ts";
import type { Caller } from "../../../identities/server.ts";
import type { Messages } from "./service.ts";
import type { Route } from "../../../http/server.ts";

type ListingNeeds = Caller | Messages | Storage | AssetStore;

const listingRoutes: readonly Route<ListingNeeds>[] = [...openThreadRoutes, ...searchRoutes];

const listingResponseSchemas = { ListOpenThreadsResponse: ListOpenThreadsResponseSchema };

const searchResponseSchemas = { SearchResponse: SearchResponseSchema };

export { type ListingNeeds, listingResponseSchemas, listingRoutes, searchResponseSchemas };
