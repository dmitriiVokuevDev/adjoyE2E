import { test, expect } from "@playwright/test";
import { BackendClient } from "../src/client";
import { freshAd, withRetry, lastReaderLine } from "../src/helpers";

// Writer-side event semantics from the proto / README contract.

test("a Click with no preceding View is rejected [spec]", {
  annotation: {
    type: "requirement",
    description:
      'writer.proto ClickRequest: "A view must already exist with the same id before a click is accepted."',
  },
}, async () => {
  // proto: "A view must already exist with the same id before a click is accepted."
  const client = new BackendClient();
  const ad = freshAd("orphan");
  const id = `orphan-${Date.now()}`;
  try {
    await expect(
      client.click({ platform: "android", ad, id }),
    ).rejects.toThrow(/FAILED_PRECONDITION|no view for click/);

    // and it must not be counted
    await client.read({ type: "vtc", platform: "android", ad });
    expect(lastReaderLine("vtc", ad).other).toBe(0);
  } finally {
    client.close();
  }
});

test("a duplicate View for the same id is rejected and not double-counted [spec]", {
  annotation: {
    type: "requirement",
    description:
      'README: "an ad can have at most one view per session." A second View for the same id must not add a window entry.',
  },
}, async () => {
  // README: "an ad can have at most one view per session."
  const client = new BackendClient();
  const ad = freshAd("dup");
  const id = `dup-${Date.now()}`;
  try {
    await withRetry(() => client.view({ platform: "android", ad, id }));
    await expect(
      client.view({ platform: "android", ad, id }),
    ).rejects.toThrow(/ALREADY_EXISTS|already exists/);

    await withRetry(() => client.click({ platform: "android", ad, id }));
    await client.read({ type: "vtc", platform: "android", ad });
    expect(lastReaderLine("vtc", ad).views, "window must hold one view, not two").toBe(1);
  } finally {
    client.close();
  }
});

test("a View succeeds on the first attempt without retry [BUG-3 guard]", {
  annotation: {
    type: "requirement",
    description:
      "Implicit reliability requirement: a View RPC should succeed without needing client retries. Today the writer returns UNAVAILABLE on the first attempt (BUG-3).",
  },
}, async () => {
  // The writer returns UNAVAILABLE on the first View attempt today, so this
  // fails. Marked test.fail(): green while the bug exists, "unexpectedly
  // passed" once fixed.
  test.fail();
  const client = new BackendClient();
  const ad = freshAd("bug3");
  const id = `s-${Date.now()}`;
  try {
    await client.view({ platform: "android", ad, id });
  } finally {
    client.close();
  }
});

test("a View lands within the retry budget", {
  annotation: {
    type: "requirement",
    description:
      "OpenAPI RetryPolicy (max_retries default 3): a View must succeed within the configured retry budget — this is what keeps BUG-3 masked in production.",
  },
}, async () => {
  // Even with the flaky writer, a view must succeed within the configured
  // retries (max_retries = 3) — this is what keeps BUG-3 masked in practice.
  const client = new BackendClient();
  const ad = freshAd("bug3ok");
  const id = `s-${Date.now()}`;
  try {
    const res = await withRetry(() => client.view({ platform: "android", ad, id }), 3, 50);
    expect(res).toBeDefined();
  } finally {
    client.close();
  }
});
