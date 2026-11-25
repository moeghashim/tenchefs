import { Mention } from "../../design-system/messages.tsx";
import type { Message } from "../../sdk/index.ts";
import type { ReactNode } from "react";
import { mentionPattern } from "../../messages/index.ts";
import { plainTextOf } from "./markdown-plain-text.ts";

const AT_SIGN = 1;
const START = 0;

interface MentionTextProps {
  readonly message: Message;
  readonly me: string;
}

interface Piece {
  readonly at: number;
  readonly text: string;
  readonly mention: string | null;
}

function piecesOf(text: string, message: Message): readonly Piece[] {
  const pieces: Piece[] = [];
  let shown = START;
  for (const found of text.matchAll(mentionPattern)) {
    const [name] = found;
    const at = found.index - AT_SIGN;
    if (message.mentions.some((mentioned) => mentioned === name)) {
      pieces.push({ at: shown, mention: null, text: text.slice(shown, at) }, { at, mention: name, text: `@${name}` });
      shown = found.index + name.length;
    }
  }
  pieces.push({ at: shown, mention: null, text: text.slice(shown) });
  return pieces;
}

export function MentionText(props: MentionTextProps): ReactNode {
  return piecesOf(plainTextOf(props.message.text), props.message).map((piece) => {
    if (piece.mention === null) {
      return piece.text;
    }
    return (
      <Mention key={piece.at} mine={piece.mention === props.me}>
        {piece.text}
      </Mention>
    );
  });
}
