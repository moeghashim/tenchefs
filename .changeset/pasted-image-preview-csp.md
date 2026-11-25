---
"@ai-hero/cookout": patch
---

In the web app, an image pasted into the message box shows its preview again: the server's Content-Security-Policy now lets images load from `blob:` URLs. A preview that is still loading or can't be shown keeps its file name hidden inside its tile.
