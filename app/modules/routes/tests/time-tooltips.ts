import { act, screen, within } from "@testing-library/react";

const RECEIPT_LINE = 1;

function timeIn(article: () => HTMLElement): HTMLElement {
  const time = article().querySelector("time");
  if (time === null) {
    throw new Error("The message shows no time");
  }
  return time;
}

function tooltipOf(time: () => HTMLElement): HTMLElement {
  const described = time().getAttribute("aria-describedby");
  for (const tooltip of screen.getAllByRole("tooltip")) {
    if (tooltip.id === described) {
      return tooltip;
    }
  }
  throw new Error("Focusing the time opened no tooltip");
}

export function timeTooltipOf(article: () => HTMLElement): readonly string[] {
  const time = timeIn(article);
  act(() => {
    time.focus();
  });
  const lines: string[] = [];
  for (const line of tooltipOf(() => time).querySelectorAll("p")) {
    lines.push(line.textContent);
  }
  return lines;
}

export async function receiptsIn(label: string): Promise<readonly (string | null)[]> {
  const list = await screen.findByRole("feed", { name: label });
  const receipts: (string | null)[] = [];
  for (const article of within(list).getAllByRole("article")) {
    receipts.push(timeTooltipOf(() => article)[RECEIPT_LINE] ?? null);
  }
  return receipts;
}
