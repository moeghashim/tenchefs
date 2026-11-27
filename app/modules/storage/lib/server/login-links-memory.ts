import { Effect, Option, pipe } from "effect";
import type { Identity, IdentityName, TokenHash } from "../../../identities/index.ts";
import type { LoginLinkRedemption, LoginLinksSection, NewLoginLink, RedeemLoginLink } from "./login-links.ts";
import { linkGone, linkRedeemed } from "./login-links.ts";
import type { EndedCredential } from "./credential-lineage.ts";
import type { Ender } from "./credential-lineage-memory.ts";
import type { Fails } from "./errors.ts";
import type { FindIdentity } from "./identity-row.ts";
import type { LoginRequestsSection } from "./login-requests.ts";
import type { MemoryState } from "./memory-state.ts";
import { newPublicId } from "./credential-lineage.ts";

interface MemoryLoginLinksOptions {
  readonly state: MemoryState;
  readonly findIdentity: FindIdentity;
  readonly issueLoginCredential: LoginRequestsSection["issueLoginCredential"];
}

type Links = Map<TokenHash, NewLoginLink>;

interface MemoryLoginLinks extends LoginLinksSection {
  readonly dropLoginLinks: (name: IdentityName) => Effect.Effect<void>;
}

function enderOf(links: Links): Ender {
  return {
    end: (hash) => {
      links.delete(hash);
    },
    live: (hash, now) =>
      pipe(
        Option.fromUndefinedOr(links.get(hash)),
        Option.filter((link) => now < link.expiresAt),
        Option.map((link): EndedCredential => ({ hash, identity: link.identity, kind: "login link" })),
      ),
  };
}

function personIn(findIdentity: FindIdentity, name: IdentityName): Option.Option<Identity> {
  return Option.filter(
    Option.fromUndefinedOr(findIdentity(name)),
    (found) => found.kind === "human" && found.deactivated !== true,
  );
}

interface Redeemable {
  readonly link: NewLoginLink;
  readonly person: Identity;
}

function redeemableIn(
  options: MemoryLoginLinksOptions,
  links: Links,
  { linkHash, now }: RedeemLoginLink,
): Option.Option<Redeemable> {
  const live = Option.filter(Option.fromUndefinedOr(links.get(linkHash)), (link) => now < link.expiresAt);
  return Option.flatMap(live, (link) =>
    Option.map(personIn(options.findIdentity, link.identity), (person): Redeemable => ({ link, person })),
  );
}

function redeemIn(options: MemoryLoginLinksOptions, links: Links) {
  return (redeem: RedeemLoginLink): Fails<LoginLinkRedemption> =>
    Option.match(redeemableIn(options, links, redeem), {
      onNone: () => Effect.succeed(linkGone()),
      onSome: ({ link, person }) => {
        const { credentialHash, host, linkHash, now } = redeem;
        links.delete(linkHash);
        options.state.lineage.markEnded({ hash: linkHash, now, why: "redeemed" });
        const issue = { credentialHash, host, identity: link.identity, now, parent: linkHash };
        return Effect.as(options.issueLoginCredential(issue), linkRedeemed(person));
      },
    });
}

function memoryLoginLinks(options: MemoryLoginLinksOptions): MemoryLoginLinks {
  const { state } = options;
  const links: Links = new Map();
  state.lineage.addEnder(enderOf(links));
  const redeem = redeemIn(options, links);
  return {
    addLoginLink: (link) =>
      Effect.flatMap(newPublicId, (publicId) =>
        Effect.andThen(
          state.ensureOpen,
          Effect.sync(() => {
            links.set(link.linkHash, { ...link });
            const { createdAt, identity, linkHash, parent } = link;
            state.lineage.record({ hash: linkHash, identity, kind: "login link", madeAt: createdAt, parent, publicId });
          }),
        ),
      ),
    dropLoginLinks: (name) =>
      Effect.sync(() => {
        for (const [hash, link] of links) {
          if (link.identity === name) {
            links.delete(hash);
          }
        }
      }),
    redeemLoginLink: (given) =>
      Effect.andThen(
        state.ensureOpen,
        Effect.suspend(() => redeem(given)),
      ),
  };
}

export { memoryLoginLinks };
