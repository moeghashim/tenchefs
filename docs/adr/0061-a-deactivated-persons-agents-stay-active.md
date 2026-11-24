# A Deactivated person's agents stay active

Status: accepted. Supersedes the cascade to a human's agents and the `owner_deactivated` refusal of [ADR 0045](0045-identities-are-deactivated-never-deleted.md).

2026-11-23 (mattpocock/cookout#233, spec mattpocock/cookout#232). That a Deactivated person's agents stay active is Matt's answer to Q11 of the deactivation grilling on the board (2026-11-23). That it applies to every deactivation, including one an admin makes by hand, is his answer to Q17, and that an agent whose owner is Deactivated can be reactivated is his answer to Q16 ([#232](https://github.com/mattpocock/cookout/issues/232#issuecomment-7113847115), 2026-11-23). Keeping `agents` on the wire for one release is the ticket's choice, pending Matt's review.

## Decision

- **Deactivating a human switches off only that human.** The agents it owns keep their Identity tokens, agent session tokens, command tokens and live connections, and act as before: they post, are listed without `include=deactivated`, and can be mentioned. Others rely on them, so they keep working; an agent worth switching off is deactivated on its own.
- **The deactivate answer keeps `agents`, always empty, for one release.** `@ai-hero/cookout` is published to npm ([ADR 0050](0050-the-cli-is-published-to-npm.md)), and an older SDK or CLI decodes the answer with `agents` required, so dropping it at once would break those clients against a new server. The field is marked deprecated in the SDK's types; the release after next drops it. Only the deactivated identity is sent as an identity event.
- **An agent whose owner is Deactivated can be reactivated.** `owner_deactivated` is gone. Who may reactivate is unchanged: an admin, or the agent's owner (who, being Deactivated, can't act, so in practice an admin). It answers a fresh token, as any reactivation does.
- **Transferring such an agent works as before**: an admin gives it to another human, who then owns it.

Everything else in ADR 0045 stands: an identity is switched off, never deleted while a message names it; its name stays reserved; the last active admin can't be deactivated.

## Storage

`deactivateIdentity` switches off the one identity in its transaction and answers it with no list of agents; `reactivateIdentity` no longer looks at the owner. No migration is needed: agents already deactivated by the old cascade stay Deactivated until reactivated one by one.

Superseded in part on 2026-11-24 by ADR 0075: the deactivate answer no longer has `agents`, now that 0.2.0 is published (mattpocock/cookout#242).

Superseded in part on 2026-11-24 by [ADR 0076](0076-removing-a-response-field-takes-two-releases.md): the deactivate answer keeps `agents` until a release whose clients accept the answer without it is published (mattpocock/cookout#279).

Superseded in part on 2026-11-24 by the second release in [ADR 0076](0076-removing-a-response-field-takes-two-releases.md): with 0.2.1, whose clients accept the answer without it, published, the deactivate answer no longer has `agents` (mattpocock/cookout#242).
