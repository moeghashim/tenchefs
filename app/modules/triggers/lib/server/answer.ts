import { Array as Arr, Option, String as Str } from "effect";

interface TriggerAnswer {
  readonly status: number;
  readonly message: string;
}

interface Answered {
  readonly message: string;
  readonly secrets: readonly string[];
}

const KEPT_CHARACTERS = 200;
const REDACTED = "[redacted]";
const characters = new Intl.Segmenter();

function redacted({ message, secrets }: Answered): string {
  return Arr.reduce(Arr.filter(secrets, Str.isNonEmpty), message, (kept, secret) =>
    Arr.join(Str.split(kept, secret), REDACTED),
  );
}

function startOf(message: string): string {
  const kept = Arr.take(characters.segment(message), KEPT_CHARACTERS);
  return Arr.join(
    Arr.map(kept, ({ segment }: Readonly<Intl.SegmentData>) => segment),
    "",
  );
}

function errorMessageOf(answered: Answered): Option.Option<string> {
  const message = Str.trim(redacted(answered));
  return Option.map(Option.liftPredicate(message, Str.isNonEmpty), startOf);
}

export { type TriggerAnswer, errorMessageOf };
