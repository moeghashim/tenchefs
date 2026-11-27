---
"@ai-hero/cookout": minor
---

In the web app, a channel's message box schedules a message with the `/schedule` Command in place of the three dots beside Send. Typing `/` lists `/schedule` ("Schedule a message") first, then the registered Webhook commands as before; picking it completes the box to `/schedule `, and sending `/schedule` and a text opens the schedule dialog with that text, posting nothing. Saving clears the box; Cancel keeps what you typed. The `Post later` button and its `Schedule…` choice are gone, and the attach button now matches Send's size and border.
