import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

const A_BOX = [{ bottom: 1, height: 1, left: 0, right: 1, top: 0, width: 1 }];
const BUTTONS = '<div><button type="button">First</button></div><button type="button">Second</button>';
const DIALOG =
  '<div role="alertdialog"><button type="button">Confirm</button><button type="button">Cancel</button></div>';

interface Buttons {
  readonly close: () => void;
  readonly first: HTMLButtonElement;
  readonly second: HTMLButtonElement;
}

function buttonNamed(name: string): HTMLButtonElement {
  const button = screen.getByText(name, { exact: true });
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError(`${name} is no button`);
  }
  return button;
}

async function opened(channel: string): Promise<Buttons> {
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "The one." });
  Object.defineProperty(HTMLElement.prototype, "getClientRects", { configurable: true, value: () => A_BOX });
  const closeApp = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  await screen.findByRole("feed", { name: "Messages" });
  screen.getByRole("main").insertAdjacentHTML("beforeend", BUTTONS);
  return {
    close: () => {
      Reflect.deleteProperty(HTMLElement.prototype, "getClientRects");
      closeApp();
    },
    first: buttonNamed("First"),
    second: buttonNamed("Second"),
  };
}

function dialogOpened(): HTMLElement {
  globalThis.document.body.insertAdjacentHTML("beforeend", DIALOG);
  buttonNamed("Confirm").focus();
  return screen.getByRole("alertdialog");
}

it("with a dialog and its opener gone from under focus, focus goes to the opener's neighbour", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { close, first, second } = await opened("web-kept-focus-dialog");
  first.focus();
  dialogOpened().remove();
  first.remove();
  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(second);
  });

  close();
});

it("with a focused button disabled and enabled again, focus goes back to it", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { close, first } = await opened("web-kept-focus-disabled");
  first.focus();
  first.disabled = true;
  await waitFor(() => {
    expect(globalThis.document.activeElement).not.toBe(first);
  });
  first.disabled = false;
  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(first);
  });

  close();
});

it("with a focused button disabled and then gone, focus goes to its neighbour", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { close, first, second } = await opened("web-kept-focus-disabled-gone");
  first.focus();
  first.disabled = true;
  await waitFor(() => {
    expect(globalThis.document.activeElement).not.toBe(first);
  });
  first.remove();
  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(second);
  });

  close();
});
