import { screen, within } from "@testing-library/react";

function articleText(article: () => HTMLElement): string {
  const copy = article().cloneNode(true);
  if (!(copy instanceof HTMLElement)) {
    return "";
  }
  for (const hidden of copy.querySelectorAll("time")) {
    hidden.remove();
  }
  for (const action of [
    ...within(copy).queryAllByRole("link", { name: "Reply" }),
    ...within(copy).queryAllByRole("button", { name: "Reply" }),
    ...within(copy).queryAllByRole("button", { name: /^(?:Close|Reopen) thread$/u }),
  ]) {
    action.remove();
  }
  return copy.textContent;
}

function separatorsBefore(article: () => HTMLElement): readonly HTMLElement[] {
  const item = article().parentElement;
  if (item === null) {
    return [];
  }
  const lines: HTMLElement[] = [];
  for (const line of within(item).queryAllByRole("separator")) {
    if (!article().contains(line)) {
      lines.push(line);
    }
  }
  return lines;
}

export async function streamOf(label: string): Promise<readonly string[]> {
  const feed = await screen.findByRole("feed", { name: label });
  const shown: string[] = [];
  for (const article of within(feed).queryAllByRole("article")) {
    for (const line of separatorsBefore(() => article)) {
      shown.push(`[${String(line.getAttribute("aria-label"))}]`);
    }
    shown.push(articleText(() => article));
  }
  return shown;
}

export async function messagesIn(label: string): Promise<readonly string[]> {
  const shown = await streamOf(label);
  return shown.filter((row) => !row.startsWith("["));
}

export async function parentShown(): Promise<string> {
  await screen.findByRole("article", { name: "Parent message" });
  return articleText(() => screen.getByRole("article", { name: "Parent message" }));
}
