import { Array as Arr, Effect, Predicate, Schema } from "effect";
import type { DialectForms, SqlDatabase, SqlValue } from "./adapters/sql-database.ts";
import type { SearchCursor, SearchPageRequest, SearchQuery, SearchSection, StoredSearchPage } from "./search.ts";
import type { MessageReader } from "./inbox-sqlite.ts";
import type { SearchResult } from "../../../search/index.ts";
import type { StorageUnavailable } from "./errors.ts";
import { unreadable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

const POSTGRES_SEARCH_MIGRATION: readonly string[] = [
  `CREATE FUNCTION message_search_words(message_text text) RETURNS tsvector
     LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
     RETURN array_to_tsvector(ARRAY(
       SELECT left(word, 500) FROM regexp_split_to_table(
         lower(regexp_replace(normalize(message_text COLLATE pg_c_utf8, NFD),
           '[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]', '', 'g')),
         '[^[:alnum:]]+') AS word
       WHERE word <> ''
     ))`,
  "CREATE INDEX message_search ON messages USING gin (message_search_words(text))",
];

const SEARCH_MIGRATION = `CREATE VIRTUAL TABLE message_search USING fts5(
     text, content = 'messages', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
   );
   CREATE TRIGGER message_search_insert AFTER INSERT ON messages BEGIN
     INSERT INTO message_search (rowid, text) VALUES (new.id, new.text);
   END;
   CREATE TRIGGER message_search_delete AFTER DELETE ON messages BEGIN
     INSERT INTO message_search (message_search, rowid, text) VALUES ('delete', old.id, old.text);
   END;
   CREATE TRIGGER message_search_update AFTER UPDATE OF text ON messages BEGIN
     INSERT INTO message_search (message_search, rowid, text) VALUES ('delete', old.id, old.text);
     INSERT INTO message_search (rowid, text) VALUES (new.id, new.text);
   END;
   INSERT INTO message_search (message_search) VALUES ('rebuild');`;

const ONE_MORE = 1;
const AFTER_EVERY_TIME = "~";
const AFTER_EVERY_ID = Number.MAX_SAFE_INTEGER;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const WORD_SEPARATOR = " ";
const OPEN = 0;
const CLOSED = 1;
const LONGEST_WORD = 500;
const ALL_OF = " & ";
const AND = " AND ";
const LIST_SEPARATOR = ", ";
const PLACEHOLDER = "?";
const NOTHING = "";
const LIVE: Condition = { params: [], sql: "deleted_at IS NULL" };

const ClosedRow = Schema.Struct({ thread_closed: Schema.Literals([OPEN, CLOSED]) });

interface SearchOptions {
  readonly db: SqlDatabase;
  readonly reader: MessageReader;
}

interface Condition {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

interface SearchSql {
  readonly columns: string;
  readonly conditions: readonly Condition[];
}

interface WordMatching {
  readonly sql: string;
  readonly match: (words: readonly string[]) => string;
  readonly rank: string;
}

function firstCharacters(word: string): string {
  return Arr.join(Arr.take(Arr.fromIterable(word), LONGEST_WORD), NOTHING);
}

const WORD_MATCHING: DialectForms<WordMatching> = {
  postgres: {
    match: (words) =>
      Arr.join(
        Arr.map(words, (word) => `'${firstCharacters(word)}':*`),
        ALL_OF,
      ),
    rank: "ts_rank(message_search_words(text), ?::tsquery, 2) DESC, ",
    sql: "message_search_words(text) @@ ?::tsquery",
  },
  sqlite: {
    match: (words) =>
      Arr.join(
        Arr.map(words, (word) => `"${word}"*`),
        WORD_SEPARATOR,
      ),
    rank: "(SELECT bm25(message_search) FROM message_search WHERE message_search MATCH ? AND rowid = messages.id), ",
    sql: "id IN (SELECT rowid FROM message_search WHERE message_search MATCH ?)",
  },
};

interface Ranking {
  readonly sql: string;
  readonly params: readonly string[];
}

interface SearchSql extends Ranking {
  readonly columns: string;
  readonly conditions: readonly Condition[];
  readonly paging: string;
}

function whereOf(conditions: readonly Condition[]): string {
  return `WHERE ${Arr.join(
    Arr.map(conditions, ({ sql }) => sql),
    AND,
  )}`;
}

function searchSql({ columns, conditions, paging, sql: ranking }: SearchSql): string {
  return `SELECT ${columns},
    (SELECT thread.closed_at IS NOT NULL FROM messages AS thread
      WHERE thread.id = coalesce(messages.reply_to, messages.id)) AS thread_closed
  FROM messages
  ${whereOf(conditions)}
  ORDER BY ${ranking}created_at DESC, id DESC ${paging}`;
}

function wordsCondition(matching: WordMatching, words: readonly string[]): readonly Condition[] {
  if (Arr.isReadonlyArrayEmpty(words)) {
    return [];
  }
  return [{ params: [matching.match(words)], sql: matching.sql }];
}

interface OneOf {
  readonly column: string;
  readonly values: readonly string[];
}

function oneOfCondition({ column, values }: OneOf): readonly Condition[] {
  if (Arr.isReadonlyArrayEmpty(values)) {
    return [];
  }
  const placeholders = Arr.join(
    Arr.map(values, () => PLACEHOLDER),
    LIST_SEPARATOR,
  );
  return [{ params: values, sql: `${column} IN (${placeholders})` }];
}

function boundCondition(sql: string, bound: string | undefined): readonly Condition[] {
  if (Predicate.isUndefined(bound)) {
    return [];
  }
  return [{ params: [bound], sql }];
}

function conditionsOf(db: SqlDatabase, query: SearchQuery): readonly Condition[] {
  return [
    LIVE,
    ...wordsCondition(WORD_MATCHING[db.dialect], query.words),
    ...oneOfCondition({ column: "author_name", values: query.authors }),
    ...oneOfCondition({ column: "channel", values: query.channels }),
    ...boundCondition("created_at < ?", query.createdBefore),
    ...boundCondition("created_at >= ?", query.createdSince),
  ];
}

function startOf(after: SearchCursor | undefined): readonly [string, number] {
  if (Predicate.isUndefined(after)) {
    return [AFTER_EVERY_TIME, AFTER_EVERY_ID];
  }
  return [after.createdAt, after.id];
}

interface Ordering {
  readonly db: SqlDatabase;
  readonly query: SearchQuery;
  readonly page: SearchPageRequest;
}

interface Ordered extends Ranking {
  readonly paging: string;
  readonly after: readonly Condition[];
  readonly pagingParams: readonly number[];
}

function orderedBy({ db, page, query }: Ordering): Ordered {
  const limit = page.limit + ONE_MORE;
  if (page.sort !== "best") {
    const [createdAt, id] = startOf(page.after);
    return {
      after: [{ params: [createdAt, id], sql: "(created_at, id) < (?, ?)" }],
      paging: "LIMIT ?",
      pagingParams: [limit],
      params: [],
      sql: NOTHING,
    };
  }
  const byOffset = { after: [], paging: "LIMIT ? OFFSET ?", pagingParams: [limit, page.offset] };
  if (Arr.isReadonlyArrayEmpty(query.words)) {
    return { ...byOffset, params: [], sql: NOTHING };
  }
  const matching = WORD_MATCHING[db.dialect];
  return { ...byOffset, params: [matching.match(query.words)], sql: matching.rank };
}

function resultOf(reader: MessageReader): (row: unknown) => Fails<SearchResult> {
  return (row) =>
    Effect.gen(function* readResult() {
      const message = yield* reader.toMessage(row);
      const { thread_closed: closed } = yield* Schema.decodeUnknownEffect(ClosedRow)(row).pipe(
        Effect.mapError(unreadable),
      );
      return { message, threadClosed: closed === CLOSED };
    });
}

interface Searching extends SearchOptions {
  readonly query: SearchQuery;
  readonly page: SearchPageRequest;
}

function searchPage({ db, page, query, reader }: Searching): Fails<StoredSearchPage> {
  const ordered = orderedBy({ db, page, query });
  const conditions = [...conditionsOf(db, query), ...ordered.after];
  const params = [...Arr.flatMap(conditions, (condition) => condition.params), ...ordered.params];
  const sql = searchSql({ ...ordered, columns: reader.columns, conditions });
  return db.all(sql, ...params, ...ordered.pagingParams).pipe(
    Effect.flatMap((rows) => Effect.forEach(rows, resultOf(reader), ONE_AT_A_TIME)),
    Effect.map((results: readonly SearchResult[]) => ({
      hasMore: results.length > page.limit,
      results: Arr.take(results, page.limit),
    })),
  );
}

function sqlSearch({ db, reader }: SearchOptions): SearchSection {
  return { searchMessages: (query, page) => searchPage({ db, page, query, reader }) };
}

export { POSTGRES_SEARCH_MIGRATION, SEARCH_MIGRATION, sqlSearch };
