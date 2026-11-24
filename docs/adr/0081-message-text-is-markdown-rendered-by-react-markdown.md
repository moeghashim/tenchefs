# Message text is Markdown, rendered by react-markdown

2026-11-24 (mattpocock/cookout#345). Merges and replaces `0048-message-text-is-markdown-rendered-by-react-markdown` and `0051-markdown-mention-links-wrapped-plain-text-blocks-and-plain-text-previews` (2026-11-23, mattpocock/cookout#151 and #158), which git history keeps. Markdown messages, like Slack but with Markdown syntax, are Matt's request on the board on 2026-11-23.

## Decision

- **react-markdown with remark-gfm and remark-breaks** renders a message's text as GitHub-flavoured Markdown, with every newline a line break. They render to React elements, so nothing goes through `dangerouslySetInnerHTML`, and raw HTML is shown as text.
- **Two files own the Markdown packages.** `app/modules/views/lib/markdown-text.tsx` renders with them, and `markdown-plain-text.ts` parses with them for one-line previews. `markdown-only-in-markdown-text` fails any other importer.
- **The packages are `devDependencies`**, like React: Vite bundles them into the web assets, and the server bundle and the SDK never import them.

## Considered options

- **markdown-to-jsx**: rejected. It has no line-break mode, its own HTML handling to audit, and no plugin seam for mentions.
- **marked or markdown-it with a sanitiser**: rejected. They render an HTML string, which needs `dangerouslySetInnerHTML` and a sanitiser to get right.
