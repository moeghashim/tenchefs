import { INBOX, rowAddresses, threadsWithReplies, typedHere } from "./inbox-keys.ts";
import { expect, it } from "vitest";
import { openWithClockStopped } from "./clock.ts";

const ONE = 1;
const NONE = 0;

it("with no row selected, r, Enter, e, u and o are left to the page", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { reader } = await threadsWithReplies({ channel: "web-inbox-keys-unselected", read: ONE, unread: NONE });
  const unmount = openWithClockStopped({ client: reader, hash: INBOX });
  await rowAddresses({ count: ONE, label: "Earlier" });
  const left = ["r", "Enter", "e", "u", "o"].map((key) => typedHere(key));

  expect([left, globalThis.location.hash]).toStrictEqual([[true, true, true, true, true], INBOX]);

  unmount();
});
