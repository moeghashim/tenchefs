import { expect, it } from "vitest";

const page = {
  getByText: (text: string): string => text,
};

it("finds its element by a substring", () => {
  expect(page.getByText("Send")).toBe("Send");
});
