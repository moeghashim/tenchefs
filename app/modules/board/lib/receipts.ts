import type { ReadReceipt } from "../../sdk/index.ts";

interface Fresh {
  readonly receipts: readonly ReadReceipt[];
  readonly fresh: readonly ReadReceipt[];
}

function sameReceipt(one: ReadReceipt, other: ReadReceipt): boolean {
  return one.messageId === other.messageId && one.identity === other.identity;
}

function withReceipts({ fresh, receipts }: Fresh): readonly ReadReceipt[] {
  return [...receipts.filter((held) => !fresh.some((each) => sameReceipt(held, each))), ...fresh];
}

export { withReceipts };
