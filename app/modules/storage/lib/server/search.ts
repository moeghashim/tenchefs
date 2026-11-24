import type { ChannelName } from "../../../channels/index.ts";
import type { Effect } from "effect";
import type { IdentityName } from "../../../identities/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { MessageId } from "../../../messages/index.ts";
import type { SearchResult } from "../../../search/index.ts";
import type { StorageUnavailable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface SearchQuery {
  readonly words: readonly string[];
  readonly authors: readonly IdentityName[];
  readonly channels: readonly ChannelName[];
  readonly createdBefore?: IsoTime;
  readonly createdSince?: IsoTime;
}

interface SearchCursor {
  readonly createdAt: IsoTime;
  readonly id: MessageId;
}

interface SearchPageRequest {
  readonly after?: SearchCursor;
  readonly limit: number;
}

interface StoredSearchPage {
  readonly results: readonly SearchResult[];
  readonly hasMore: boolean;
}

interface SearchSection {
  readonly searchMessages: (query: SearchQuery, page: SearchPageRequest) => Fails<StoredSearchPage>;
}

export type { SearchCursor, SearchPageRequest, SearchQuery, SearchSection, StoredSearchPage };
