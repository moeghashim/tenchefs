/**
 * The web's `search` store: the page state of the search box, kept out of the board store because a search is one
 * answer to one query that no live event changes (spec mattpocock/cookout#317, "Where search results live"). It holds
 * the query as typed, whether the results list is open, the result pages as the server answered them and which result
 * is highlighted. It reaches the server only through `search`, the board store's `calls.search`, which answers a page
 * or the server's refusal without keeping it. `edit` takes the query as typed and opens the list; a short `pause`
 * after the last edit it asks for the first page, and an answer to an older query that arrives after a newer one is
 * dropped. A query with neither words nor filters, as the shared parser reads it, asks nothing. `loadMore` asks for
 * the next page and adds it to the list; `move` moves the highlight down or up, and moving onto the last result loaded
 * loads the next page. `open` and `close` open and close the list, keeping the query and its results.
 */
export {
  type Search,
  type SearchAnswer,
  type SearchState,
  createSearch,
} from "./lib/search-store.ts";
