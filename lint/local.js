import { noOverloads, noPickIntersections } from "./rules/type-declarations.js";
import allowedDirectives from "./rules/allowed-directives.js";
import brandedIds from "./rules/branded-ids.js";
import effectErrors from "./rules/effect-errors.js";
import glossaryTerms from "./rules/glossary-terms.js";
import maxFileTokens from "./rules/max-file-tokens.js";
import noComments from "./rules/no-comments.js";
import noPassThrough from "./rules/no-pass-through.js";
import noUnsafeAs from "./rules/no-unsafe-as.js";
import { sortImports } from "./rules/sort-imports.js";

export default {
  meta: { name: "local" },
  rules: {
    "allowed-directives": allowedDirectives,
    "branded-ids": brandedIds,
    "effect-errors": effectErrors,
    "glossary-terms": glossaryTerms,
    "max-file-tokens": maxFileTokens,
    "no-comments": noComments,
    "no-overloads": noOverloads,
    "no-pass-through": noPassThrough,
    "no-pick-intersections": noPickIntersections,
    "no-unsafe-as": noUnsafeAs,
    "sort-imports": sortImports,
  },
};
