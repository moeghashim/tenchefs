---
"@ai-hero/cookout": patch
---

Web UI: a channel's message box can schedule what you typed. Its "Post later" menu has "Schedule…", which opens a dialog seeded with the text: once (a date and a time) or recurring (a 5-field cron expression), in a time zone that defaults to the browser's. The dialog shows the next 3 runs as you type, or why the timing is refused (more often than every 30 minutes, not a valid cron expression, never runs, an unknown time zone, or a time already past), and can't be saved until the timing is valid. Saving creates the Scheduled message, clears the box and says when it next runs. A thread's reply box has no "Schedule…", since every run posts a new top-level message.
