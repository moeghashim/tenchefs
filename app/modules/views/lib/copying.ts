async function copyAfter(previous: Promise<void>, text: string): Promise<void> {
  await previous;
  await globalThis.navigator.clipboard.writeText(text);
}

function createCopier(): (text: string) => void {
  let copying = Promise.resolve();
  return (text) => {
    copying = copyAfter(copying, text);
  };
}

export { createCopier };
