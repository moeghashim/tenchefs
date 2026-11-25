import type { DeactivationOffers, DeactivationOffersState } from "../../unread/index.ts";
import type { DeactivationOffer } from "../../sdk/index.ts";
import { FeedList } from "../../design-system/feed.tsx";
import { OfferRow } from "./offer-row.tsx";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

const NONE = 0;
const LABEL = "Earlier deactivation offers";

interface EarlierOffersProps {
  readonly offers: DeactivationOffers;
}

function clearedOf(state: DeactivationOffersState): readonly DeactivationOffer[] {
  if (state.status !== "loaded") {
    return [];
  }
  return state.deactivationOffers.filter(({ cleared }) => cleared);
}

export function EarlierOffers(props: EarlierOffersProps): ReactNode {
  const state = useSyncExternalStore(props.offers.subscribe, props.offers.snapshot);
  const cleared = clearedOf(state);
  return (
    cleared.length > NONE && (
      <FeedList label={LABEL}>
        {cleared.map((offer) => (
          <OfferRow key={offer.id} offer={offer} open={false} />
        ))}
      </FeedList>
    )
  );
}
