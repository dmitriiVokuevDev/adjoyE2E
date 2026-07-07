import { test, expect } from "@playwright/test";
import { BackendClient } from "../src/client";
import { freshAd, withRetry, lastReaderLine } from "../src/helpers";

// README: "metrics are counted per ad per platform (the same ad can run on
// android and ios, with different metrics for each)." This verifies the two
// platforms keep separate windows for the same ad.

test("android and ios metrics for the same ad do not mix", {
  annotation: {
    type: "requirement",
    description:
      'README: "metrics are counted per ad per platform (the same ad can run on android and ios, with different metrics for each)."',
  },
}, async () => {
  const client = new BackendClient();
  const ad = freshAd("platform");
  try {
    // android: 1 view + 2 clicks -> vtc 2.0
    const aId = `a-${Date.now()}`;
    await withRetry(() => client.view({ platform: "android", ad, id: aId }));
    for (let i = 0; i < 2; i++)
      await withRetry(() => client.click({ platform: "android", ad, id: aId }));

    // ios: 1 view + 4 clicks -> vtc 4.0
    const iId = `i-${Date.now()}`;
    await withRetry(() => client.view({ platform: "ios", ad, id: iId }));
    for (let i = 0; i < 4; i++)
      await withRetry(() => client.click({ platform: "ios", ad, id: iId }));

    const vtcAndroid = await client.read({ type: "vtc", platform: "android", ad });
    expect(vtcAndroid.value).toBeCloseTo(2.0, 6);
    expect(lastReaderLine("vtc", ad).views).toBe(1); // last read was android

    const vtcIos = await client.read({ type: "vtc", platform: "ios", ad });
    expect(vtcIos.value).toBeCloseTo(4.0, 6);

    // The two platforms must be independent, not summed.
    expect(vtcAndroid.value).not.toBeCloseTo(vtcIos.value, 6);
  } finally {
    client.close();
  }
});
