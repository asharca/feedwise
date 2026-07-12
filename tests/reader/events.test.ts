import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTIONS_CHANGED_EVENT,
  dispatchSubscriptionsChanged,
  type SubscriptionsChangedDetail,
} from "@/lib/reader/events";

describe("reader events", () => {
  it("dispatches subscription changes with the affected feed", () => {
    const details: SubscriptionsChangedDetail[] = [];
    const listener = (event: Event) => {
      details.push((event as CustomEvent<SubscriptionsChangedDetail>).detail);
    };

    window.addEventListener(SUBSCRIPTIONS_CHANGED_EVENT, listener);
    dispatchSubscriptionsChanged("feed-1");
    window.removeEventListener(SUBSCRIPTIONS_CHANGED_EVENT, listener);

    expect(details).toEqual([{ feedId: "feed-1" }]);
  });
});
