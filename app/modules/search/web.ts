/**
 * The web's `search` store: the page state of the search box, kept out of the board store because which messages a
 * search found is one answer to one query that no live event changes (spec mattpocock/cookout#317, "Where search
 * results live"). It holds the query as typed, whether the results list is open, the result message IDs of the pages
 * the server answered, in order, and which result is highlighted. It keeps no message: each row reads its message,
 * thread state and author from the board store (`searchResultsOf(ids)`), so it follows live events with no new search
 * (mattpocock/cookout#520). It reaches the server only through `search`, the board store's `calls.search`, which
 * answers a page or the server's refusal. `edit` takes the query as typed and opens the list; a short `pause`
 * after the last edit it asks for the first page, and an answer to an older query that arrives after a newer one is
 * dropped. A query with neither words nor filters, as the shared parser reads it, asks nothing. `loadMore` asks for
 * the next page and adds it to the list. `sortBy` switches between newest first and best match, keeping the query, and
 * asks for the first page in that order at once. The highlight starts on the first entry of the box's list, which may list
 * `ahead` places, channels and people before the messages; `move` moves it down or up through both, and moving onto
 * the last message loaded loads the next page. `open` and `close` open and close the list, keeping the query and its results.
 * `edit` also takes the caret (the end of the query if not given), for the filter suggestions the box reads from the
 * text before it; one suggestion is highlighted (the first, after each edit), `moveSuggestion` moves it down or up
 * among `count`, wrapping round, and `dismissSuggestions` hides them until the next edit.
 */
export {
  type Search,
  type SearchAnswer,
  type SearchState,
  createSearch,
} from "./lib/search-store.ts";
