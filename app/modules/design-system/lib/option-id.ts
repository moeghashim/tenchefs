interface OptionAt {
  readonly list: string;
  readonly index: number;
}

function optionIdOf({ index, list }: OptionAt): string {
  return `${list}-option-${String(index)}`;
}

export { type OptionAt, optionIdOf };
