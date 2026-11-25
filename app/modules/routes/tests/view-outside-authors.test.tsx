import { expect, it } from "vitest";
import { ReconnectingView } from "../../views/index.tsx";
import { render } from "@testing-library/react";

it("a view that reads the board store, drawn outside Authors, fails saying Authors provides the store", {
  timeout: 2000,
}, () => {
  expect.hasAssertions();

  expect(() => render(<ReconnectingView />)).toThrow(
    "A view that reads the board store is drawn inside Authors, which provides it.",
  );
});
