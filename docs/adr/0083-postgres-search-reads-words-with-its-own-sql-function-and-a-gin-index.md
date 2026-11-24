# Postgres search reads words with its own SQL function and a GIN index

2026-11-24 (mattpocock/cookout#385, spec #330). The ticket left Postgres full-text search or `pg_trgm` to the implementer, provided accents and prefixes match SQLite's results, with an ADR if the choice adds an extension. This one adds none; it is recorded because the word rule now lives in a migration.

## Decision

- **Words come from a SQL function, `message_search_words(text)`,** created by Postgres migration 4: the text in NFD, the combining diacritical marks removed (U+0300–036F, 1AB0–1AFF, 1DC0–1DFF, 20D0–20FF, FE20–FE2F), lower-cased, and split on every run of characters that are not `[[:alnum:]]`. That is the search module's word rule (a run of letters and digits, without case or accents) and the words SQLite's `unicode61 remove_diacritics 2` finds. The function builds a `tsvector` with `array_to_tsvector`, so no text search configuration or dictionary touches the words.
- **The function runs under the built-in `pg_c_utf8` collation,** which gives Unicode letter classes and case mapping without ICU or the OS locale. An index on an `IMMUTABLE` function must never change its answer, and the built-in provider changes only with a Postgres major version.
- **A GIN expression index, `message_search`, holds every message's words.** A query's words become one `tsquery`, each word a prefix (`'deplo':* & 'failed':*`), which the index answers, as `postgres-query-plans.test.ts` checks. An expression index needs no trigger or backfill: creating it reads every message already stored, and an insert, edit or delete keeps it current in the same transaction.
- **A word keeps its first 500 characters,** in the index and in a query. A `tsvector` refuses a word over 2,047 bytes, and 500 characters are at most 2,000 bytes, so a message with a long word (a hash, a base64 blob) is still stored and found by its start.
- Newest first, the cursor and the filters are the same SQL as SQLite's; only the words condition differs by dialect.

## Considered options

- **The `simple` text search configuration with the `unaccent` extension:** rejected. Postgres's parser keeps `ada@example.com`, URLs, file paths and `v1.2` as single tokens, so `example` would find a message on SQLite and miss it on Postgres. `unaccent` is an extension that the deployed database must allow, its function isn't `IMMUTABLE`, and its rules (`ß` to `ss`, `æ` to `ae`) differ from SQLite's.
- **`pg_trgm`:** rejected. Matching a word's start needs a regular expression the trigram index answers only loosely, and accents would still need `unaccent`.
- **Words computed in TypeScript and stored in a column:** rejected. Rows stored before the migration would need a backfill in code, and the cutover copy would have to compute them too.

## Consequences

- Outside Latin text the three Layers already differ at the edges: SQLite's Unicode tables are older than JavaScript's, and Postgres treats non-ASCII digits and other numerals (`²`, `٣`) as separators, as SQLite doesn't. The contract suite pins Latin text, accents and prefixes.
- Changing the word rule means a new Postgres migration that replaces the function and rebuilds the index, and the same change to SQLite's tokenizer and the search module.
