import { expect, it } from "vitest";
import type { ThreadChoice } from "../../design-system/messages.tsx";

function chosen(): void {
  expect.fail("never chosen");
}

it("a menu item without an icon fails the type check, so every menu draws one", { timeout: 1000 }, () => {
  expect.hasAssertions();

  // @ts-expect-error A thread choice must name its icon.
  const missing: ThreadChoice = { label: "Close", name: "Close thread", onSelect: chosen };
  const named: ThreadChoice = { icon: "close", label: "Close", name: "Close thread", onSelect: chosen };

  expect([missing.label, named.icon]).toStrictEqual(["Close", "close"]);
});
