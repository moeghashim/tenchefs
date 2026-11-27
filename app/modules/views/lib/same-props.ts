type Fields = Readonly<object>;

function entriesOf(fields: Fields): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>(Object.entries(fields));
}

function sameFields(one: Fields, other: Fields): boolean {
  const before = entriesOf(one);
  const after = entriesOf(other);
  return before.size === after.size && [...before.keys()].every((key) => Object.is(before.get(key), after.get(key)));
}

export function sameProps<Rebuilt extends string>(
  rebuilt: Rebuilt,
): <Props extends Readonly<Record<Rebuilt, Fields>>>(before: Props, after: Props) => boolean {
  return (before, after) =>
    sameFields(before[rebuilt], after[rebuilt]) &&
    sameFields({ ...before, [rebuilt]: null }, { ...after, [rebuilt]: null });
}
