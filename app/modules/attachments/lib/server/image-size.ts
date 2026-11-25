import { Array as Arr, Option } from "effect";
import type { ImageContentType } from "../../index.ts";

interface ImageSize {
  readonly width: number;
  readonly height: number;
}

interface Field {
  readonly at: number;
  readonly length: number;
  readonly order: "big" | "little";
}

interface Header {
  readonly bytes: Uint8Array;
  readonly contentType: ImageContentType;
}

type JpegStep =
  | { readonly kind: "next"; readonly at: number }
  | { readonly kind: "done"; readonly found: Option.Option<ImageSize> };

const NONE = 0;
const BYTE = 256;
const ONE_BYTE = 1;
const TWO_BYTES = 2;
const THREE_BYTES = 3;
const FOUR_BYTES = 4;
const ONE_MORE = 1;

const PNG_CHUNK_TYPE = 12;
const PNG_WIDTH = 16;
const PNG_HEIGHT = 20;
const PNG_HEADER_CHUNK = "IHDR";

const GIF_WIDTH = 6;
const GIF_HEIGHT = 8;

const WEBP_CHUNK = 12;
const VP8_FRAME_START = 23;
const VP8_FRAME_MARKER = "\u009D\u0001*";
const VP8_WIDTH = 26;
const VP8_HEIGHT = 28;
const VP8_DIMENSION_LIMIT = 16_384;
const VP8L_SIGNATURE_AT = 20;
const VP8L_SIGNATURE = 47;
const VP8L_BITS = 21;
const VP8X_WIDTH = 24;
const VP8X_HEIGHT = 27;

const JPEG_FIRST_MARKER = 2;
const MARKER_PREFIX = 255;
const SOF_HEIGHT = 5;
const SOF_WIDTH = 7;
const STANDALONE_MARKERS: ReadonlySet<number> = new Set(Buffer.from("01d0d1d2d3d4d5d6d7d8", "hex"));
const FRAME_MARKERS: ReadonlySet<number> = new Set(Buffer.from("c0c1c2c3c5c6c7c9cacbcdcecf", "hex"));
const SCAN_MARKERS: ReadonlySet<number> = new Set(Buffer.from("d9da", "hex"));

function inOrder(found: readonly number[], order: Field["order"]): readonly number[] {
  if (order === "little") {
    return Arr.reverse(found);
  }
  return found;
}

function read(bytes: Uint8Array, field: Field): Option.Option<number> {
  if (field.at + field.length > bytes.length) {
    return Option.none();
  }
  const found = [...bytes.subarray(field.at, field.at + field.length)];
  return Option.some(Arr.reduce(inOrder(found, field.order), NONE, (sum, byte) => sum * BYTE + byte));
}

function textAt(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCodePoint(...bytes.subarray(at, at + length));
}

function sized(width: Option.Option<number>, height: Option.Option<number>): Option.Option<ImageSize> {
  return Option.filter(Option.all({ height, width }), (size) => size.width > NONE && size.height > NONE);
}

function readBig(bytes: Uint8Array, at: number, length: number): Option.Option<number> {
  return read(bytes, { at, length, order: "big" });
}

function readLittle(bytes: Uint8Array, at: number, length: number): Option.Option<number> {
  return read(bytes, { at, length, order: "little" });
}

function pngSize(bytes: Uint8Array): Option.Option<ImageSize> {
  if (textAt(bytes, PNG_CHUNK_TYPE, FOUR_BYTES) !== PNG_HEADER_CHUNK) {
    return Option.none();
  }
  return sized(readBig(bytes, PNG_WIDTH, FOUR_BYTES), readBig(bytes, PNG_HEIGHT, FOUR_BYTES));
}

function gifSize(bytes: Uint8Array): Option.Option<ImageSize> {
  return sized(readLittle(bytes, GIF_WIDTH, TWO_BYTES), readLittle(bytes, GIF_HEIGHT, TWO_BYTES));
}

function dimension(value: number): number {
  return value % VP8_DIMENSION_LIMIT;
}

function lossyWebpSize(bytes: Uint8Array): Option.Option<ImageSize> {
  if (textAt(bytes, VP8_FRAME_START, THREE_BYTES) !== VP8_FRAME_MARKER) {
    return Option.none();
  }
  return sized(
    Option.map(readLittle(bytes, VP8_WIDTH, TWO_BYTES), dimension),
    Option.map(readLittle(bytes, VP8_HEIGHT, TWO_BYTES), dimension),
  );
}

function losslessWebpSize(bytes: Uint8Array): Option.Option<ImageSize> {
  const signed = Option.filter(readBig(bytes, VP8L_SIGNATURE_AT, ONE_BYTE), (found) => found === VP8L_SIGNATURE);
  const bits = Option.flatMap(signed, () => readLittle(bytes, VP8L_BITS, FOUR_BYTES));
  return sized(
    Option.map(bits, (value) => dimension(value) + ONE_MORE),
    Option.map(bits, (value) => dimension(Math.floor(value / VP8_DIMENSION_LIMIT)) + ONE_MORE),
  );
}

function plusOne(value: number): number {
  return value + ONE_MORE;
}

function extendedWebpSize(bytes: Uint8Array): Option.Option<ImageSize> {
  return sized(
    Option.map(readLittle(bytes, VP8X_WIDTH, THREE_BYTES), plusOne),
    Option.map(readLittle(bytes, VP8X_HEIGHT, THREE_BYTES), plusOne),
  );
}

const webpChunks: Readonly<Record<string, (bytes: Uint8Array) => Option.Option<ImageSize>>> = {
  "VP8 ": lossyWebpSize,
  VP8L: losslessWebpSize,
  VP8X: extendedWebpSize,
};

function webpSize(bytes: Uint8Array): Option.Option<ImageSize> {
  return Option.flatMap(Option.fromNullishOr(webpChunks[textAt(bytes, WEBP_CHUNK, FOUR_BYTES)]), (reader) =>
    reader(bytes),
  );
}

function finished(found: Option.Option<ImageSize>): JpegStep {
  return { found, kind: "done" };
}

function stepTo(at: number): JpegStep {
  return { at, kind: "next" };
}

function skipSegment(bytes: Uint8Array, at: number): JpegStep {
  return Option.match(readBig(bytes, at + TWO_BYTES, TWO_BYTES), {
    onNone: () => finished(Option.none()),
    onSome: (length) => stepTo(at + TWO_BYTES + length),
  });
}

function markerStep(bytes: Uint8Array, at: number, marker: number): JpegStep {
  if (marker === MARKER_PREFIX) {
    return stepTo(at + ONE_BYTE);
  }
  if (STANDALONE_MARKERS.has(marker)) {
    return stepTo(at + TWO_BYTES);
  }
  if (SCAN_MARKERS.has(marker)) {
    return finished(Option.none());
  }
  if (FRAME_MARKERS.has(marker)) {
    return finished(sized(readBig(bytes, at + SOF_WIDTH, TWO_BYTES), readBig(bytes, at + SOF_HEIGHT, TWO_BYTES)));
  }
  return skipSegment(bytes, at);
}

function jpegStep(bytes: Uint8Array, at: number): JpegStep {
  return Option.match(readBig(bytes, at, TWO_BYTES), {
    onNone: () => finished(Option.none()),
    onSome: (code) => {
      if (Math.floor(code / BYTE) !== MARKER_PREFIX) {
        return finished(Option.none());
      }
      return markerStep(bytes, at, code % BYTE);
    },
  });
}

function jpegSize(bytes: Uint8Array): Option.Option<ImageSize> {
  let step = stepTo(JPEG_FIRST_MARKER);
  while (step.kind === "next") {
    step = jpegStep(bytes, step.at);
  }
  return step.found;
}

const readers: Readonly<Record<ImageContentType, (bytes: Uint8Array) => Option.Option<ImageSize>>> = {
  "image/gif": gifSize,
  "image/jpeg": jpegSize,
  "image/png": pngSize,
  "image/webp": webpSize,
};

function imageSize({ bytes, contentType }: Header): Option.Option<ImageSize> {
  return readers[contentType](bytes);
}

export { imageSize };
