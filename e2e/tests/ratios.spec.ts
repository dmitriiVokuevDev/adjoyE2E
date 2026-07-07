import { test, expect } from "@playwright/test";
import { BackendClient } from "../src/client";
import { freshAd, withRetry, lastReaderLine } from "../src/helpers";

// Backend-level regression tests for the reader ratios (vtc / vti).
//
// Isolation strategy: each ad/platform has its OWN sliding window, so every
// test uses a UNIQUE ad id (freshAd). That makes tests independent of each
// other and of any prior state — no server reset needed. (The Android UI is
// pinned to `ad-001`, which is why these live at the backend tier.)
//
// Two caveats this suite encodes:
//  - The writer returns UNAVAILABLE on first View attempts (BUG-3): writes go
//    through withRetry, mirroring the SDK's retry policy.
//  - `installs` are simulated randomly by the backend, so vti cannot be
//    asserted to an exact value — we assert the invariant vti == installs/views
//    (reading the operands from reader.log) instead.

test("vtc — 1 view + 3 clicks gives clicks/views = 3.0", {
  annotation: {
    type: "requirement",
    description:
      'README/reader.proto: the reader returns the "view-to-click ratio (vtc)". Derived denominator = views ⇒ vtc = clicks / views.',
  },
}, async () => {
  const client = new BackendClient();
  const ad = freshAd("ratios");
  const id = `sess-${Date.now()}`;
  try {
    await withRetry(() => client.view({ platform: "android", ad, id }));
    for (let i = 0; i < 3; i++) {
      await withRetry(() => client.click({ platform: "android", ad, id }));
    }
    const res = await client.read({ type: "vtc", platform: "android", ad });
    expect(res.value).toBeCloseTo(3.0, 6);

    const log = lastReaderLine("vtc", ad);
    expect(log.views).toBe(1);
    expect(log.other).toBe(3); // other == clicks for vtc
    expect(log.value).toBeCloseTo(log.other / log.views, 6);
  } finally {
    client.close();
  }
});

test("vtc — 2 views + 5 clicks total gives 2.5", {
  annotation: {
    type: "requirement",
    description:
      "README: vtc is aggregated over the windowed views for an ad — total clicks / total views (5 / 2 = 2.5).",
  },
}, async () => {
  const client = new BackendClient();
  const ad = freshAd("ratios");
  const s1 = `s1-${Date.now()}`;
  const s2 = `s2-${Date.now()}`;
  try {
    await withRetry(() => client.view({ platform: "android", ad, id: s1 }));
    for (let i = 0; i < 2; i++)
      await withRetry(() => client.click({ platform: "android", ad, id: s1 }));
    await withRetry(() => client.view({ platform: "android", ad, id: s2 }));
    for (let i = 0; i < 3; i++)
      await withRetry(() => client.click({ platform: "android", ad, id: s2 }));

    const res = await client.read({ type: "vtc", platform: "android", ad });
    expect(res.value).toBeCloseTo(2.5, 6);

    const log = lastReaderLine("vtc", ad);
    expect(log.views).toBe(2);
    expect(log.other).toBe(5);
  } finally {
    client.close();
  }
});

test("vti — reader publishes installs/views (installs are simulated)", {
  annotation: {
    type: "requirement",
    description:
      'README/reader.proto: the reader returns the "view-to-installation ratio (vti)". Installs are simulated by the backend ⇒ vti = installs / views (invariant).',
  },
}, async () => {
  const client = new BackendClient();
  const ad = freshAd("ratios");
  const views = 4;
  try {
    for (let i = 0; i < views; i++) {
      // id must be stable across retries — the writer counts attempts per id.
      const id = `v${i}-${Date.now()}`;
      await withRetry(() => client.view({ platform: "android", ad, id }));
    }
    const res = await client.read({ type: "vti", platform: "android", ad });

    const log = lastReaderLine("vti", ad);
    expect(log.views).toBe(views);
    expect(log.other).toBeGreaterThanOrEqual(0); // installs simulated, not fixed
    // The invariant must hold regardless of how many installs were simulated:
    expect(res.value).toBeCloseTo(log.other / log.views, 6);
  } finally {
    client.close();
  }
});

test("fresh ad with no events yields vtc = 0 and vti = 0", {
  annotation: {
    type: "requirement",
    description:
      'reader.proto Response: "When no views exist for the requested (platform, ad), the value is zero rather than undefined."',
  },
}, async () => {
  const client = new BackendClient();
  const ad = freshAd("ratios");
  try {
    expect((await client.read({ type: "vtc", platform: "android", ad })).value).toBe(0);
    expect((await client.read({ type: "vti", platform: "android", ad })).value).toBe(0);
  } finally {
    client.close();
  }
});
