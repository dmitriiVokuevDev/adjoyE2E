import { test, expect } from "@playwright/test";
import { BackendClient } from "../src/client";
import { freshAd, withRetry, lastReaderLine } from "../src/helpers";

// The sliding window is the most intricate business rule in the system:
// views are stored in a window of 10 per ad/platform; the 11th view evicts
// the oldest, AND the evicted session's clicks must leave the click count
// with it (verified manually from writer.log earlier; codified here).
//
// Design: session 1 gets a distinctive click load (5), sessions 2..11 get one
// click each. After the 11th view the window must hold sessions 2..11 only:
//
//   views = 10 (not 11)          — window capped
//   clicks = 10 (not 15)         — session 1's 5 clicks evicted with it
//   vtc    = 10/10 = 1.0         — 1.5 would mean clicks are NOT evicted
//
// Each wrong behaviour produces a different wrong number, so one test
// discriminates all three failure modes.

test("11th view evicts the oldest session together with its clicks", {
  annotation: {
    type: "requirement",
    description:
      'README: "Views are stored in a sliding window of size 10 per ad/platform; once 10 views exist, the oldest is evicted by the next." The evicted session\'s clicks leave with it.',
  },
}, async () => {
  const client = new BackendClient();
  const ad = freshAd("evict");
  try {
    // session 1: 1 view + 5 clicks (the distinctive load that must vanish)
    const s1 = `s1-${Date.now()}`;
    await withRetry(() => client.view({ platform: "android", ad, id: s1 }));
    for (let i = 0; i < 5; i++) {
      await withRetry(() => client.click({ platform: "android", ad, id: s1 }));
    }

    // sessions 2..11: 1 view + 1 click each; the 11th view triggers eviction
    for (let n = 2; n <= 11; n++) {
      const id = `s${n}-${Date.now()}`; // stable across retries
      await withRetry(() => client.view({ platform: "android", ad, id }));
      await withRetry(() => client.click({ platform: "android", ad, id }));
    }

    const res = await client.read({ type: "vtc", platform: "android", ad });

    // reader echo contract (proto: response carries platform and ad back)
    expect(res.ad).toBe(ad);
    expect(res.platform).toBe("android");

    // 10 windowed views, 10 windowed clicks -> vtc = 1.0
    expect(res.value).toBeCloseTo(1.0, 6);

    const log = lastReaderLine("vtc", ad);
    expect(log.views, "window must cap at 10 views").toBe(10);
    expect(log.other, "evicted session's clicks must leave the count").toBe(10);
  } finally {
    client.close();
  }
});
