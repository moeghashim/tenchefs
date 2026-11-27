import type { AskedOffer } from "./asked-offer.ts";
import { ButtonRow } from "../../design-system/controls.tsx";
import type { DeactivationOffer } from "../../sdk/index.ts";
import type { DeactivationOffers } from "../../unread/index.ts";
import type { Identities } from "../../composer/index.ts";
import { IdentityConfirm } from "./identity-confirm.tsx";
import { OfferRow } from "./offer-row.tsx";
import type { ReactNode } from "react";
import { RowButton } from "../../design-system/feed.tsx";
import { useCallback } from "react";

const TEXT = { deactivate: "Deactivate", keep: "Keep" } as const;

interface OpenOfferRowProps {
  readonly offer: DeactivationOffer;
  readonly offers: Pick<DeactivationOffers, "keep">;
  readonly identities: Pick<Identities, "actions">;
  readonly asking: Pick<AskedOffer, "ask" | "closed">;
}

export function OpenOfferRow(props: OpenOfferRowProps): ReactNode {
  const { asking, offer, offers } = props;
  const actions = props.identities.actions(offer.identity.name);
  const handleDeactivate = useCallback(() => {
    asking.ask(offer);
    actions.ask.deactivate();
  }, [actions, asking, offer]);
  const handleCloseFocused = useCallback(() => {
    if (actions.snapshot().confirming === null) {
      asking.closed(offer.id);
    }
  }, [actions, asking, offer]);
  const handleKeep = useCallback(() => {
    offers.keep(offer.id);
  }, [offers, offer]);
  return (
    <OfferRow offer={offer} open>
      <ButtonRow>
        <RowButton onClick={handleDeactivate}>{TEXT.deactivate}</RowButton>
        <RowButton onClick={handleKeep}>{TEXT.keep}</RowButton>
      </ButtonRow>
      <IdentityConfirm actions={actions} identity={offer.identity} onCloseFocused={handleCloseFocused} />
    </OfferRow>
  );
}
