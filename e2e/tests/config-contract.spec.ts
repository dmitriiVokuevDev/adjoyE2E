import { test, expect } from "@playwright/test";

// Contract tests for the config service against the OpenAPI spec
// (backend/openapi.yaml — explicitly authoritative when the live response
// disagrees).
//
// Convention: tests guarding CONFIRMED bugs are marked `test.fail()` — they
// are EXPECTED to fail while the bug exists, so the suite stays green and
// readable. When the bug is fixed, Playwright reports them as "unexpectedly
// passed", which is the signal to remove the annotation. Bug ids reference
// deliverables/03-prioritised-bugs.md.

const BASE = "http://localhost:8083";

async function getConfig(query: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}/config${query}`);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body — leave null */
  }
  return { status: res.status, body };
}

test("platform key is correctly spelled and echoes the query param [BUG-2 guard]", {
  annotation: {
    type: "requirement",
    description:
      'OpenAPI ClientConfig.platform: "MUST equal the platform query parameter from the request." Required field; if missing the SDK falls back to the hardcoded default "android".',
  },
}, async () => {
  // Spec: ClientConfig.platform is required and MUST equal the request's
  // platform query param. The live service returns the key misspelled as
  // "platfrom", so the correctly-spelled key is absent and the SDK silently
  // falls back to "android" — mis-attributing all iOS traffic.
  test.fail(); // expected to fail until BUG-2 is fixed

  const { status, body } = await getConfig("?platform=ios&app_id=test-app");
  expect(status).toBe(200);
  expect(body).toHaveProperty("platform", "ios");
});

test("session_ended template contains the {n} placeholder [BUG-4 guard]", {
  annotation: {
    type: "requirement",
    description:
      'OpenAPI Toasts.session_ended: "Must contain the placeholder {n}, which the SDK replaces with the number of clicks the user made during the session."',
  },
}, async () => {
  // Spec: the template "Must contain the placeholder {n}", which the SDK
  // replaces with the session's click count. Live value: "Session Ended: {n clicks".
  test.fail(); // expected to fail until BUG-4 is fixed

  const { status, body } = await getConfig("?platform=android&app_id=test-app");
  expect(status).toBe(200);
  expect(body?.ui_layout?.toasts?.session_ended).toContain("{n}");
});

test("missing platform is rejected with 400", {
  annotation: {
    type: "requirement",
    description: 'OpenAPI: "400 — Invalid or missing platform query parameter."',
  },
}, async () => {
  const { status, body } = await getConfig("?app_id=test-app");
  expect(status).toBe(400);
  expect(typeof body?.error).toBe("string");
});

test("invalid platform is rejected with 400 invalid_platform", {
  annotation: {
    type: "requirement",
    description:
      'OpenAPI: Platform enum is [android, ios] only; invalid values return 400 with Error { error: "invalid_platform" }.',
  },
}, async () => {
  const { status, body } = await getConfig("?platform=windows&app_id=test-app");
  expect(status).toBe(400);
  expect(body?.error).toBe("invalid_platform");
});

test("unknown route returns 404", {
  annotation: {
    type: "requirement",
    description: 'OpenAPI: "404 — Route not found."',
  },
}, async () => {
  const res = await fetch(`${BASE}/nope`);
  expect(res.status).toBe(404);
});

test("response shape matches the documented field constraints", {
  annotation: {
    type: "requirement",
    description:
      "OpenAPI ClientConfig: sample_rate in [0.0, 1.0]; enabled_event_types a subset of [view, click]; retry_policy.max_retries/backoff_ms are non-negative integers.",
  },
}, async () => {
  const { status, body } = await getConfig("?platform=android&app_id=test-app");
  expect(status).toBe(200);

  // ui_layout.toasts.session_ended: required, string
  expect(typeof body?.ui_layout?.toasts?.session_ended).toBe("string");

  // sample_rate: number in [0, 1]
  expect(typeof body?.sample_rate).toBe("number");
  expect(body.sample_rate).toBeGreaterThanOrEqual(0);
  expect(body.sample_rate).toBeLessThanOrEqual(1);

  // enabled_event_types: subset of [view, click]
  expect(Array.isArray(body?.enabled_event_types)).toBe(true);
  for (const t of body.enabled_event_types) {
    expect(["view", "click"]).toContain(t);
  }

  // retry_policy: non-negative integers
  expect(body?.retry_policy?.max_retries).toBeGreaterThanOrEqual(0);
  expect(body?.retry_policy?.backoff_ms).toBeGreaterThanOrEqual(0);
});
