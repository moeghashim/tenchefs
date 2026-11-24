import type { ChannelName, CookoutClient, CookoutEvent, Refusal } from "../../sdk/index.ts";
import type { Failure } from "./failure.ts";
import type { Slice } from "./slice.ts";
import { failure } from "./failure.ts";

type AskedFrom = "channel-header" | "channel-menu";

type ChangeState =
  | { readonly status: "idle" }
  | { readonly status: "changing"; readonly channel: ChannelName }
  | (Failure & { readonly channel: ChannelName; readonly from: AskedFrom });

type SubscriptionsState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly channels: readonly ChannelName[]; readonly change: ChangeState }
  | Failure;

type SubscriptionChange =
  | CookoutEvent
  | { readonly type: "subscription-asked"; readonly channel: ChannelName }
  | { readonly type: "subscription-answered"; readonly channel: ChannelName; readonly subscribed: boolean }
  | {
      readonly type: "subscription-refused";
      readonly channel: ChannelName;
      readonly from: AskedFrom;
      readonly refusal: Refusal;
    };

type SubscriptionsClient = Pick<CookoutClient, "listSubscribedChannels" | "subscribe" | "unsubscribe">;

const LOADING = { status: "loading" } as const;

const IDLE = { status: "idle" } as const;

interface Subscribed {
  readonly channel: ChannelName;
  readonly subscribed: boolean;
}

function withChannel(channels: readonly ChannelName[], { channel, subscribed }: Subscribed): readonly ChannelName[] {
  if (channels.includes(channel) === subscribed) {
    return channels;
  }
  const others = channels.filter((each) => each !== channel);
  if (subscribed) {
    return [...others, channel].toSorted();
  }
  return others;
}

type Loaded = Extract<SubscriptionsState, { readonly status: "loaded" }>;

function withSubscribed(state: Loaded, subscribed: Subscribed): Loaded {
  const channels = withChannel(state.channels, subscribed);
  if (channels === state.channels) {
    return state;
  }
  return { ...state, channels };
}

function changeOf(change: SubscriptionChange): ChangeState | null {
  if (change.type === "subscription-asked") {
    return { channel: change.channel, status: "changing" };
  }
  if (change.type === "subscription-refused") {
    return { ...change.refusal, channel: change.channel, from: change.from, status: "failed" };
  }
  if (change.type === "subscription-answered") {
    return IDLE;
  }
  return null;
}

function subscribedOf(change: SubscriptionChange): Subscribed | null {
  if (change.type === "subscription") {
    return change.subscription;
  }
  if (change.type === "subscription-answered") {
    return change;
  }
  if (change.type === "channel-deleted") {
    return { channel: change.channel.name, subscribed: false };
  }
  return null;
}

function heldChange(held: SubscriptionsState): ChangeState {
  if (held.status === "loaded") {
    return held.change;
  }
  return IDLE;
}

function applied(state: SubscriptionsState, change: SubscriptionChange): SubscriptionsState {
  if (state.status !== "loaded") {
    return state;
  }
  const subscribed = subscribedOf(change);
  const changing = changeOf(change);
  let next = state;
  if (subscribed !== null) {
    next = withSubscribed(next, subscribed);
  }
  if (changing !== null) {
    next = { ...next, change: changing };
  }
  return next;
}

const subscriptionsSlice: Slice<SubscriptionsState, SubscriptionsClient, SubscriptionChange> = {
  apply: applied,
  empty: LOADING,
  read: async (client, held) => {
    try {
      const { channels } = await client.listSubscribedChannels();
      return {
        change: heldChange(held),
        channels: channels.map((channel) => channel.name).toSorted(),
        status: "loaded",
      };
    } catch (error: unknown) {
      return failure(error);
    }
  },
};

function refusedAs(error: unknown): Refusal {
  const { code, message } = failure(error);
  return { code, message };
}

export {
  type AskedFrom,
  type SubscriptionChange,
  type SubscriptionsClient,
  type SubscriptionsState,
  refusedAs,
  subscriptionsSlice,
};
