import type { ParsedQuery } from "../../search/index.ts";
import type { ReactNode } from "react";
import { matchedPieces } from "../../search/index.ts";
import { plainTextOf } from "./markdown-plain-text.ts";

interface SearchTextProps {
  readonly text: string;
  readonly query: ParsedQuery;
}

export function SearchText(props: SearchTextProps): ReactNode {
  let at = 0;
  return matchedPieces({ query: props.query, text: plainTextOf(props.text) }).map((piece) => {
    at += piece.text.length;
    if (!piece.matched) {
      return piece.text;
    }
    return (
      <mark className="rounded-sm bg-mention-bar/30 px-0.5 text-foreground" key={at}>
        {piece.text}
      </mark>
    );
  });
}
