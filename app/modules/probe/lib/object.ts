function objectIn(value: unknown): object {
  if (typeof value === "object" && value !== null) {
    return value;
  }
  return {};
}

export { objectIn };
