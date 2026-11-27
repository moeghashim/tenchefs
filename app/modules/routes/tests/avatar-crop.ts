const PNG_SIGNATURE = Uint8Array.from(Buffer.from("89504e470d0a1a0a", "hex"));

async function pngAvatarCrop(file: Blob): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    return null;
  }
  return bytes;
}

export { pngAvatarCrop };
