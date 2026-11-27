import type { CookoutClient, CookoutEvent, EventStream, MessageId } from "../../sdk/index.ts";
import { conversationOpened, viewOpened } from "./view-opened.ts";
import { expect, it, vi } from "vitest";
import { inConversation, inThread } from "./regions.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";
import { watched } from "./watched.ts";

const TITLE = "Deploy **window** for `v2`";

interface Titled {
  readonly channel: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly parent: MessageId;
}

interface Titling {
  readonly channel: string;
  readonly title: string | null;
  readonly replies: readonly string[];
}

async function repliedAll(thread: Titled, replies: readonly string[]): Promise<void> {
  const [text, ...rest] = replies;
  if (typeof text !== "string") {
    return;
  }
  await thread.poster.createMessage({ channel: thread.channel, replyTo: thread.parent, text });
  await repliedAll(thread, rest);
}

async function threadTitled({ channel, replies, title }: Titling): Promise<Titled> {
  const { poster, reader } = await subscribedReader(channel);
  const { message } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  const thread = { channel, parent: message.id, poster, reader };
  if (title !== null) {
    await poster.setThreadTitle(message.id, title);
  }
  await repliedAll(thread, replies);
  return thread;
}

function threadHash(thread: Titled): string {
  return `#/channels/${thread.channel}/threads/${String(thread.parent)}`;
}

function headingIn(panel: () => HTMLElement): Element {
  const found = panel().querySelector("header h2");
  if (found === null) {
    throw new TypeError("The panel's header has no heading");
  }
  return found;
}

function metaIn(panel: () => HTMLElement): Element {
  const found = headingIn(panel).nextElementSibling;
  if (found === null) {
    throw new TypeError("Nothing follows the panel's heading");
  }
  return found;
}

function headingAndMeta(panel: () => HTMLElement): readonly string[] {
  const meta = metaIn(panel);
  return [headingIn(panel).textContent, meta.textContent, String(meta.querySelector("svg") !== null)];
}

async function threadHeaderShows(shown: readonly string[]): Promise<void> {
  await vi.waitFor(() => {
    expect(headingAndMeta(inThread().element)).toStrictEqual(shown);
  });
}

it("a titled thread's panel header shows its title as typed, with the thread, its channel and its replies beneath", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadTitled({ channel: "web-title-header", replies: ["Noon works.", "Or one."], title: TITLE });
  const close = openAt({ client: thread.reader, hash: threadHash(thread) });
  await inThread().findByText("Or one.");

  await threadHeaderShows([TITLE, `Thread · #${thread.channel} · 2 replies`, "true"]);

  expect(inThread().getByRole("heading", { level: 2, name: TITLE })).toBeDefined();
  expect(inThread().getByRole("article", { name: "Parent message" }).textContent).toContain("Deploy at noon?");

  close();
});

it("a titled thread with one reply says 1 reply, and with none only the thread and its channel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const one = await threadTitled({ channel: "web-title-one", replies: ["Noon works."], title: "One reply" });
  const closeOne = openAt({ client: one.reader, hash: threadHash(one) });
  await inThread().findByText("Noon works.");
  await threadHeaderShows(["One reply", `Thread · #${one.channel} · 1 reply`, "true"]);
  closeOne();

  const none = await threadTitled({ channel: "web-title-none", replies: [], title: "No replies" });
  const closeNone = openAt({ client: none.reader, hash: threadHash(none) });
  await threadHeaderShows(["No replies", `Thread · #${none.channel}`, "true"]);
  closeNone();
});

it("an untitled thread's panel header stays Thread with its channel beside it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadTitled({ channel: "web-title-untitled", replies: ["Noon works."], title: null });
  const close = openAt({ client: thread.reader, hash: threadHash(thread) });
  await inThread().findByText("Noon works.");

  await threadHeaderShows(["Thread", `#${thread.channel}`, "false"]);

  close();
});

it("the thread on its own shows the same titled header", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadTitled({ channel: "web-title-alone", replies: ["Noon works."], title: TITLE });
  const close = openAt({ client: thread.reader, hash: `${threadHash(thread)}/alone` });
  await inThread().findByRole("link", { name: "Back to channel" });

  await threadHeaderShows([TITLE, `Thread · #${thread.channel} · 1 reply`, "true"]);

  close();
});

it("a titled thread opened from the Inbox shows its title over the thread, its channel and its replies", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const thread = await threadTitled({ channel: "web-title-inbox", replies: [], title: TITLE });
  await thread.reader.follow(thread.parent);
  await repliedAll(thread, ["Noon works.", "Or one."]);
  const { close } = await conversationOpened({
    client: thread.reader,
    hash: `#/inbox/${thread.channel}/${String(thread.parent)}`,
  });
  await inConversation().findByText("Or one.");

  expect(headingAndMeta(inConversation().element)).toStrictEqual([
    TITLE,
    `Thread · #${thread.channel} · 2 replies`,
    "true",
  ]);

  close();
});

it("an untitled thread opened from the Inbox keeps its Conversation header", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const thread = await threadTitled({ channel: "web-title-inbox-untitled", replies: [], title: null });
  await thread.reader.follow(thread.parent);
  await repliedAll(thread, ["Noon works."]);
  const { close } = await conversationOpened({
    client: thread.reader,
    hash: `#/inbox/${thread.channel}/${String(thread.parent)}`,
  });
  await inConversation().findByText("Noon works.");

  expect(headingAndMeta(inConversation().element)).toStrictEqual(["Conversation", `#${thread.channel}`, "false"]);

  close();
});

function titledAs(parent: MessageId, title: string): (event: CookoutEvent) => boolean {
  return (event) => event.type === "thread" && event.parent.id === parent && (event.parent.title ?? "") === title;
}

interface OpenedLive {
  readonly thread: Titled;
  readonly titled: (title: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

async function openedLive(channel: string): Promise<OpenedLive> {
  const thread = await threadTitled({ channel, replies: ["Noon works."], title: null });
  const { heard, live, stream } = watched(thread.reader);
  const { close } = await viewOpened({
    client: thread.reader,
    hash: threadHash(thread),
    live,
    waitingOn: ["getThread"],
  });
  const events: EventStream = await stream;
  await inThread().findByText("Noon works.");
  return {
    close: async () => {
      close();
      await events.close();
    },
    thread,
    titled: async (title) => {
      await thread.poster.setThreadTitle(thread.parent, title);
      await heard(titledAs(thread.parent, title));
    },
  };
}

it("a title set, changed or cleared elsewhere updates the panel header live", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const { close, thread, titled } = await openedLive("web-title-live");
  const meta = `Thread · #${thread.channel} · 1 reply`;
  await titled("Set elsewhere");
  await threadHeaderShows(["Set elsewhere", meta, "true"]);
  await titled("Changed elsewhere");
  await threadHeaderShows(["Changed elsewhere", meta, "true"]);
  await titled("");
  await threadHeaderShows(["Thread", `#${thread.channel}`, "false"]);

  await close();
});

it("a new reply updates a titled thread's reply count in its panel header live", { timeout: 8000 }, async () => {
  expect.hasAssertions();

  const { close, thread, titled } = await openedLive("web-title-live-reply");
  await titled("Counting");
  await thread.poster.createMessage({ channel: thread.channel, replyTo: thread.parent, text: "Or one." });
  await threadHeaderShows(["Counting", `Thread · #${thread.channel} · 2 replies`, "true"]);

  await close();
});
