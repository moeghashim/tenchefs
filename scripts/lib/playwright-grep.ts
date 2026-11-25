interface Grepped {
  readonly grep: readonly string[];
  readonly rest: readonly string[];
}

const GREP_FLAG = "-g";
const NOT_FOUND = -1;
const AFTER = 1;
const PAIR = 2;
const START = 0;

function grepped(args: readonly string[]): Grepped | null {
  const at = args.indexOf(GREP_FLAG);
  if (at === NOT_FOUND) {
    return { grep: [], rest: args };
  }
  const title = args[at + AFTER] ?? "";
  if (title === "") {
    return null;
  }
  return { grep: [GREP_FLAG, title], rest: [...args.slice(START, at), ...args.slice(at + PAIR)] };
}

export { grepped };
