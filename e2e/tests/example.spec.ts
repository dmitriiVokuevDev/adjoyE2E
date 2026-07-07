import { test, expect } from '@playwright/test';
import { BackendClient } from '../src/client';

// Example test. Replace or extend with your own.
//
// This test sends one view and one click sharing an id, then reads back the
// view-to-click ratio. With a single view and a single click, the vtc ratio
// for that ad should be 1.0.
//
// Treat this as a sanity check that your environment is wired up correctly,
// not as a real regression test.

test('happy path: one view, one click, vtc is 1.0', {
  annotation: {
    type: 'requirement',
    description:
      'README: one view + one click sharing an id ⇒ vtc = 1.0. Provided sanity check; fails today because the raw client has no retry and the writer returns UNAVAILABLE (BUG-3).',
  },
}, async () => {
  // KNOWN FAILURE — BUG-3: the writer returns UNAVAILABLE on the first View
  // attempts, and this starter client has no retry, so the provided example
  // fails out of the box ("14 UNAVAILABLE: writer temporarily unavailable").
  // Marked test.fail() to document the defect without editing the original
  // body; when BUG-3 is fixed this reports "unexpectedly passed" — remove
  // the annotation then.
  test.fail();

  const client = new BackendClient();
  const ad = `automation-${Date.now()}`;
  const id = `session-${Date.now()}`;

  try {
    await client.view({ platform: 'android', ad, id });
    await client.click({ platform: 'android', ad, id });

    const response = await client.read({
      type: 'vtc',
      platform: 'android',
      ad,
    });

    expect(response.value).toBe(1.0);
    expect(response.ad).toBe(ad);
    expect(response.platform).toBe('android');
  } finally {
    client.close();
  }
});
