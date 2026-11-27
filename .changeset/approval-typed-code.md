---
"@ai-hero/cookout": patch
---

The approval page can't be phished. `cookout login` and `cookout join` now print the approval page's address (`/#/approve`) and the code to type there, never a link holding the code, and the page opens with an empty Code field that no link fills. Typing the code shows the request's details above Approve: its kind (terminal login, browser login or agent join), its browser and OS or its host, its client IP (`Fly-Client-IP` on Fly) and how long ago it started. `GET` and approving a Login request or an agent join request answer the same details (`kind`, `where`, `clientIp`, `createdAt`), so `cookout login approve` and `cookout approve-join` print them too. The server records a request's client IP and User-Agent when it starts.
