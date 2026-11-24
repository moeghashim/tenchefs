/**
 * Search, shared by the server, the SDK and the web: the one rule for what a
 * word is, the parser that reads a query as typed, the answer of the search
 * route, its path and the error codes it refuses with. A word is a run of
 * letters and digits, without case or accents: punctuation, `@` and `#` separate
 * words, so `**Café**` is the word `cafe`. The storage Layers match with the same
 * word rule, so what the web highlights is what the server found. A query also
 * holds the `from:`, `in:`, `before:` and `after:` filters.
 */
import type { Message } from "../messages/index.ts";

const WORD = /[\p{L}\p{N}]+/gu;
const MARKS = /\p{M}/gu;
const NO_MARKS = "";
const NO_WORDS = 0;

function wordsOf(text: string): readonly string[] {
  const plain = text.normalize("NFD").replaceAll(MARKS, NO_MARKS).toLowerCase();
  return plain.match(WORD) ?? [];
}

function isMatched(word: string, query: { readonly words: readonly string[] }): boolean {
  return wordsOf(word).some((each) => query.words.some((asked) => each.startsWith(asked)));
}

const SPACES = /\s+/u;
const FILTERS = ["from", "in", "before", "after"] as const;
const WORDS = "words";
const SIGILS: Readonly<Record<(typeof FILTERS)[number], RegExp>> = {
  after: /^/u,
  before: /^/u,
  from: /^@/u,
  in: /^#/u,
};

interface Term {
  readonly kind: (typeof FILTERS)[number] | typeof WORDS;
  readonly text: string;
}

function asFilter(text: string): (filter: (typeof FILTERS)[number]) => readonly Term[] {
  return (filter) => {
    const prefix = `${filter}:`;
    const bare = text.slice(prefix.length).replace(SIGILS[filter], NO_MARKS);
    if (!text.startsWith(prefix) || bare.length === NO_WORDS) {
      return [];
    }
    return [{ kind: filter, text: bare }];
  };
}

function termOf(text: string): Term {
  const [term = { kind: WORDS, text }] = FILTERS.flatMap(asFilter(text));
  return term;
}

function textsOf(terms: readonly Term[], kind: Term["kind"]): readonly string[] {
  return terms.filter((term) => term.kind === kind).map((term) => term.text);
}

/**
 * A query as the server reads it. Every word must match a word of the message that equals it or starts with it. Each
 * filter keeps what was typed after `from:`, `in:`, `before:` or `after:`, without the `@` or `#`, in the order typed:
 * the server checks that each names an identity, a channel or a real `YYYY-MM-DD` day.
 */
export interface ParsedQuery extends Readonly<Record<(typeof FILTERS)[number], readonly string[]>> {
  readonly words: readonly string[];
}

/**
 * Reads a query as typed: `from:@name`, `in:#channel`, `before:YYYY-MM-DD` and `after:YYYY-MM-DD` are filters, with
 * `@` and `#` optional, and the rest is words. An unknown `word:` is ordinary words.
 * @param query The query as typed.
 * @returns The query's words and filters.
 */
export function parseQuery(query: string): ParsedQuery {
  const terms = query.split(SPACES).map((text) => termOf(text));
  return {
    after: textsOf(terms, "after"),
    before: textsOf(terms, "before"),
    from: textsOf(terms, "from"),
    in: textsOf(terms, "in"),
    words: textsOf(terms, WORDS).flatMap((text) => wordsOf(text)),
  };
}

/**
 * Whether a parsed query asks for nothing, neither words nor filters, which the server refuses as `empty_query`.
 * @param parsed The parsed query.
 * @returns Whether it has no words and no filters.
 */
export function isEmptyQuery(parsed: ParsedQuery): boolean {
  return [parsed.words, ...FILTERS.map((filter) => parsed[filter])].every((values) => values.length === NO_WORDS);
}

/** A message's text and the query it is matched against. */
export interface Matching {
  readonly text: string;
  readonly query: Pick<ParsedQuery, "words">;
}

/**
 * Whether the text holds every word of the query, each as a word of its own or the start of one.
 * @param matching The text and the parsed query.
 * @returns Whether the text matches.
 */
export function matchesQuery(matching: Matching): boolean {
  const words = wordsOf(matching.text);
  return matching.query.words.every((asked) => words.some((word) => word.startsWith(asked)));
}

/** A run of a text: a word that matches a query word, or anything else. */
export interface TextPiece {
  readonly text: string;
  readonly matched: boolean;
}

/**
 * Splits a text into runs, each word that equals or starts with a query word its own matched run, by the same word
 * rule the server matches with, so the web highlights what the server found.
 * @param matching The text and the parsed query.
 * @returns The text's runs, in order, joining back into the text.
 */
export function matchedPieces(matching: Matching): readonly TextPiece[] {
  const pieces: TextPiece[] = [];
  let shown = NO_WORDS;
  for (const found of matching.text.matchAll(WORD)) {
    const [word] = found;
    if (isMatched(word, matching.query)) {
      pieces.push({ matched: false, text: matching.text.slice(shown, found.index) }, { matched: true, text: word });
      shown = found.index + word.length;
    }
  }
  pieces.push({ matched: false, text: matching.text.slice(shown) });
  return pieces.filter((piece) => piece.text.length > NO_WORDS);
}

/** One search result: the message as a channel listing or thread shows it, and whether its thread is Closed. */
export interface SearchResult {
  readonly message: Message;
  readonly threadClosed: boolean;
}

/** A page of search results, newest first; `cursor` is null on the last page. */
export interface SearchResponse {
  readonly results: readonly SearchResult[];
  readonly hasMore: boolean;
  readonly cursor: string | null;
}

/** `GET /v1/search?q=<query>&cursor=<cursor>&limit=<n>`: a page of the messages matching a query, in every channel. */
export const searchPath = "/v1/search";

/** The codes the search route refuses with. */
export const searchErrorCodes = ["empty_query", "unknown_identity", "unknown_channel", "invalid_date"] as const;
