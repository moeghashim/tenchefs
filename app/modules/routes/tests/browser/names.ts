import { test } from "@playwright/test";
import { uniqueName } from "../../../testing/index.ts";

export function unique(name: string): string {
  return uniqueName({ name, run: test.info() });
}
