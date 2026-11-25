export function listen(pressed: (event: KeyboardEvent) => void): void {
  globalThis.document.addEventListener("keydown", pressed);
}
