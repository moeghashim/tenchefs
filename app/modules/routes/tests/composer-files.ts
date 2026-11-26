import type { Attachment, Message } from "../../sdk/index.ts";
import { fireEvent, screen, within } from "@testing-library/react";
import { onTestFinished, vi } from "vitest";
import { hillsPng } from "../../testing/index.ts";

const NOTES_LENGTH = 1536;

interface FileSpec {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly type: string;
}

interface Sizing {
  readonly name: string;
  readonly size: number;
}

interface Handing {
  readonly form: string;
  readonly files: readonly FileSpec[];
}

class PreviewUrl extends URL {
  public static override createObjectURL(blob: Readonly<Blob>): string {
    return `blob:preview/${String(blob.size)}`;
  }

  public static override revokeObjectURL(url: string): void {
    if (!url.startsWith("blob:preview/")) {
      throw new TypeError(`${url} was never made by createObjectURL`);
    }
  }
}

function submitterIn(value: unknown): HTMLElement | null {
  if (value instanceof HTMLElement) {
    return value;
  }
  return null;
}

function isFormDataClass(value: unknown): value is new () => FormData {
  return typeof value === "function";
}

function formDataClass(value: unknown): new () => FormData {
  if (!isFormDataClass(value)) {
    throw new TypeError("Node has no FormData");
  }
  return value;
}

async function nodeFormData(): Promise<unknown> {
  const sample = await new Response("a=1", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }).formData();
  const NodeFormData = formDataClass(sample.constructor);
  const PageFormData = FormData;
  function formData(...from: readonly unknown[]): FormData {
    const data = new NodeFormData();
    const [element, submitter] = from;
    if (element instanceof HTMLFormElement) {
      for (const [name, value] of new PageFormData(element, submitterIn(submitter))) {
        data.append(name, value);
      }
    }
    return data;
  }
  formData.prototype = Reflect.getPrototypeOf(sample);
  return formData;
}

async function nodeBlob(): Promise<unknown> {
  const blob = await new Response("a").blob();
  return blob.constructor;
}

async function filesSupported(): Promise<void> {
  vi.stubGlobal("URL", PreviewUrl);
  vi.stubGlobal("FormData", await nodeFormData());
  vi.stubGlobal("Blob", await nodeBlob());
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
}

const hills: FileSpec = { bytes: hillsPng(), name: "hills.png", type: "image/png" };

const notes: FileSpec = {
  bytes: new TextEncoder().encode("x".repeat(NOTES_LENGTH)),
  name: "notes.txt",
  type: "text/plain",
};

function sized({ name, size }: Sizing): FileSpec {
  return { bytes: new Uint8Array(size), name, type: "" };
}

function filesOf(specs: readonly FileSpec[]): File[] {
  return specs.map(({ bytes, name, type }) => new File([Uint8Array.from(bytes)], name, { type }));
}

function formNamed(name: string): HTMLElement {
  return screen.getByRole("form", { name });
}

function pasteInto({ files, form }: Handing): boolean {
  return fireEvent.paste(within(formNamed(form)).getByRole("textbox"), {
    clipboardData: { files: filesOf(files), types: ["Files"] },
  });
}

function pasteText(form: string): boolean {
  return fireEvent.paste(within(formNamed(form)).getByRole("textbox"), {
    clipboardData: { files: [], items: [{ getAsFile: (): null => null, kind: "string" }], types: ["text/plain"] },
  });
}

function pasteItemsInto({ files, form }: Handing): boolean {
  const items = filesOf(files).map((file) => ({ getAsFile: (): File => file, kind: "file" }));
  return fireEvent.paste(within(formNamed(form)).getByRole("textbox"), {
    clipboardData: { files: [], items: [{ getAsFile: (): null => null, kind: "string" }, ...items], types: ["Files"] },
  });
}

interface Carrying {
  readonly region: string;
  readonly files: readonly FileSpec[];
}

interface Carried {
  readonly dataTransfer: { readonly files: readonly File[]; readonly types: readonly string[] };
}

function carried(files: readonly FileSpec[]): Carried {
  return { dataTransfer: { files: filesOf(files), types: ["Files"] } };
}

function regionNamed(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

function dragInto({ files, region }: Carrying): void {
  fireEvent.dragEnter(regionNamed(region), carried(files));
}

function dragOutOf({ files, region }: Carrying): void {
  fireEvent.dragLeave(regionNamed(region), carried(files));
}

function dropOn({ files, form }: Handing): void {
  fireEvent.drop(formNamed(form), { dataTransfer: { files: filesOf(files), types: ["Files"] } });
}

function dropInto({ files, region }: Carrying): void {
  fireEvent.drop(regionNamed(region), carried(files));
}

function dropOnPage(files: readonly FileSpec[]): boolean {
  return fireEvent.drop(document.body, carried(files));
}

function dragNothingOverPage(): boolean {
  return fireEvent.dragOver(document.body, { dataTransfer: null });
}

function litZones(): number {
  return document.querySelectorAll(`[data-dropping="true"]`).length;
}

function dragOnto({ files, form }: Handing): boolean {
  return fireEvent.dragOver(formNamed(form), { dataTransfer: { files: filesOf(files), types: ["Files"] } });
}

function dragTextOnto(form: string): boolean {
  return fireEvent.dragOver(formNamed(form), { dataTransfer: { files: [], types: ["text/plain"] } });
}

function pickerIn(form: string): HTMLInputElement {
  const picker = formNamed(form).querySelector("input[type=file]");
  if (!(picker instanceof HTMLInputElement)) {
    throw new TypeError("The box has no file picker");
  }
  return picker;
}

function pickIn({ files, form }: Handing): void {
  fireEvent.change(pickerIn(form), { target: { files: filesOf(files) } });
}

function pickNothingIn(form: string): void {
  fireEvent.change(pickerIn(form), { target: { files: null } });
}

function pendingIn(form: string): readonly string[] {
  const list = within(formNamed(form)).queryByRole("list", { name: "Files to send" });
  if (list === null) {
    return [];
  }
  const shown: string[] = [];
  for (const item of within(list).getAllByRole("listitem")) {
    const image = item.querySelector("img");
    if (image === null) {
      shown.push(item.textContent);
    } else {
      shown.push(`${image.alt} ${image.getAttribute("src") ?? ""}`);
    }
  }
  return shown;
}

function namesIn(messages: readonly Message[]): readonly (readonly [string, readonly string[]])[] {
  return messages.map((message) => [
    message.text,
    (message.attachments ?? []).map((attachment: Readonly<Attachment>) => attachment.name),
  ]);
}

export {
  dragInto,
  dragOutOf,
  dropInto,
  dropOnPage,
  dragNothingOverPage,
  litZones,
  pasteItemsInto,
  dragOnto,
  dragTextOnto,
  dropOn,
  filesSupported,
  formNamed,
  hills,
  namesIn,
  notes,
  pasteInto,
  pasteText,
  pendingIn,
  pickIn,
  pickNothingIn,
  pickerIn,
  sized,
};
