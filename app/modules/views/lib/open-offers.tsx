import { createAskedOffer, shownWith } from "./asked-offer.ts";
import { useMemo, useSyncExternalStore } from "react";
import type { DeactivationOffer } from "../../sdk/index.ts";
import type { DeactivationOffers } from "../../unread/index.ts";
import type { Identities } from "../../composer/index.ts";
import { OpenOfferRow } from "./open-offer-row.tsx";
import type { ReactNode } from "react";

interface OpenOffersProps {
  readonly offers: readonly DeactivationOffer[];
  readonly deactivationOffers: Pick<DeactivationOffers, "keep">;
  readonly identities: Pick<Identities, "actions">;
}

export function OpenOffers(props: OpenOffersProps): ReactNode {
  const asking = useMemo(() => createAskedOffer(), []);
  const asked = useSyncExternalStore(asking.subscribe, asking.snapshot);
  return shownWith({ asked, offers: props.offers }).map((offer) => (
    <OpenOfferRow
      asking={asking}
      identities={props.identities}
      key={`offer ${String(offer.id)}`}
      offer={offer}
      offers={props.deactivationOffers}
    />
  ));
}
