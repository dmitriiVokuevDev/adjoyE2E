# Prioritised Bug List & Reports

Every issue found, prioritised with a one-line justification, followed by full repro for each
confirmed bug and a list of unsure / open observations.

**Shared environment:** Backend Docker stack (writer :8081, reader :8082, config :8083,
swagger-ui :8084, redis) · Android emulator `sdk_gphone64_arm64` API 34 (task recommends
API 33) · QA Test App `io.adjoe.qatest` v1.0 · tools: adb/UiAutomator, curl, Node gRPC client.

## Prioritised list

| # | Priority | Issue | Justification |
|---|---|---|---|
| BUG-1 | **P0** | Phantom Click on X dismiss | Inflates `vtc` on *every* session, all platforms; the core click KPI is fabricated |
| BUG-2 | **P0** | Config key misspelled `platfrom` | Silent, permanent mis-attribution of *all* iOS traffic to Android; corrupts both platforms' metrics |
| BUG-3 | **P1** | `View` returns `UNAVAILABLE` on first attempts | Latency + view-loss risk if retries degrade; already breaks the provided example test |
| BUG-4 | **P2** | `session_ended` template missing `}` in `{n}` | User-facing (toast can't show click count) + contract violation, but no metric impact |
| BUG-5 | **P2** | `clicks_total` log field windowed but named "total" | No data corruption, but a `…_total` that decreases misleads any downstream log consumer |

Unconfirmed suspicions and open questions are in **[Observations & open questions](#observations--open-questions-unsure)** at the end.

---

## BUG-1 — Closing the ad overlay via the X records a phantom Click  *(Critical / P0)*

- **Requirement violated (README):** "Tapping the ad itself sends a click event tied to the same session" and "Tapping the **X** in the corner closes the overlay" — only tapping the ad emits a click; dismissing must not.
- **Environment:** emulator (any platform), backend up.
- **Steps to reproduce (manual):**
  1. On the host: `tail -f backend/logs/writer.log`.
  2. On the emulator, launch the **QA Test App**.
  3. Tap **View ad** — the full-screen ad overlay opens.
  4. Do **not** tap the ad creative.
  5. Tap the **X** in the top-right corner to close.
  6. Look at `writer.log`.
- **Steps to reproduce (automated):** `cd android-tests && ./run-e2e.sh` → test `closing_with_x_must_not_record_a_click` fails.
- **Expected result:** no `Click` event — the ad was never tapped.
- **Actual result:** one `Click` event is logged for the session (`rpc=Click … clicks_for_view=1`). Every session closed via X over-counts clicks by 1.

---

## BUG-2 — Config returns misspelled key `platfrom` instead of `platform`  *(Critical / P0)*

- **Requirement violated (OpenAPI `ClientConfig.platform`):** required field that "**MUST equal the `platform` query parameter from the request.**… If this field is missing from the response, the SDK falls back to the hardcoded default `android`."
- **Environment:** config service `:8083`, Swagger UI `:8084`.
- **Steps to reproduce (manual):**
  1. Open a browser at **http://localhost:8084/** (Swagger UI) — or directly at
     **http://localhost:8083/config?platform=ios&app_id=test-app**.
  2. In Swagger, execute `GET /config` with `platform = ios`, `app_id = test-app`.
  3. Read the top-level keys of the JSON response.
- **Steps to reproduce (CLI):** `curl -s 'http://localhost:8083/config?platform=ios&app_id=test-app' | jq 'keys'`
- **Expected result:** the response contains `"platform": "ios"` (must equal the query param).
- **Actual result:** the response contains `"platfrom": "ios"`; the correct key `platform` is absent, so the SDK falls back to the default `"android"` → all iOS events attributed to Android. *(Not visible through the app on an android emulator, where the default happens to match.)*

---

## BUG-3 — `View` RPC returns UNAVAILABLE on the first attempts  *(High / P1)*

- **Requirement violated (writer.proto `WriterService/View`):** a well-formed `View` request returns a `Response` (success); no failure mode is documented for valid input. Returning `UNAVAILABLE` on a valid first attempt breaks this service contract (implicit reliability requirement).
- **Environment:** writer `localhost:8081`, single gRPC call with no retry.
- **Steps to reproduce (manual):**
  1. Send **one** View with grpcurl (a single call, no retry):
     ```sh
     grpcurl -plaintext -import-path backend/proto -proto writer.proto \
       -d '{"platform":"android","ad":"ad-manual","id":"v-1"}' \
       localhost:8081 writer.WriterService/View
     ```
  2. Observe the response. *(Note: cannot be seen through the app — the SDK retries and hides it.)*
- **Steps to reproduce (automated):** `cd e2e && npx playwright test tests/example.spec.ts` (raw client, no retry) — fails.
- **Expected result:** the View is accepted on the first attempt (`OK` / a `Response`).
- **Actual result:** `14 UNAVAILABLE: writer temporarily unavailable (attempt 1/3)`; the View only succeeds around the 3rd attempt for the same id.

---

## BUG-4 — `session_ended` template is missing the `}` of the `{n}` placeholder  *(Medium / P2)*

- **Requirement violated (OpenAPI `Toasts.session_ended`):** the template "Must contain the placeholder `{n}`, which the SDK replaces with the number of clicks the user made during the session."
- **Environment:** config service `:8083`; also surfaced in the app's on-screen status panel.
- **Steps to reproduce (manual):**
  1. On the emulator app's home screen, find the **Cached config** panel and read the
     `session_ended` row — **or** drive **View ad → tap the ad → X** and watch the
     end-of-session toast.
  2. (Alternative) open **http://localhost:8083/config?platform=android&app_id=test-app** in a
     browser and read `ui_layout.toasts.session_ended`.
- **Steps to reproduce (CLI):** `curl -s 'http://localhost:8083/config?platform=android&app_id=test-app' | jq '.ui_layout.toasts.session_ended'`
- **Expected result:** `"Session Ended: {n} clicks"` (must contain the `{n}` placeholder).
- **Actual result:** `"Session Ended: {n clicks"` — the closing brace is missing, so `{n}` is never interpolated and the click count is lost in the toast.

---

## BUG-5 — writer.log `clicks_total` is windowed but named like a lifetime total  *(Medium / P2)*

- **Requirement violated:** none documented — this is a logging-clarity issue. It breaks the conventional expectation that a `…_total` counter is a monotonic lifetime value (the field is actually the windowed sum and decreases on eviction). Raised to P2 because a `…_total` that silently decreases is a trap for any downstream log consumer (dashboards / alerts / analysis).
- **Environment:** writer log `backend/logs/writer.log`.
- **Steps to reproduce (manual):**
  1. On the host: `tail -f backend/logs/writer.log`.
  2. In the app, run a full flow (**View ad → tap the ad → X**) repeatedly — **11+ times** on
     the same ad (the emulator is pinned to `ad-001`), giving the first session several clicks.
  3. Watch the `clicks_total` value as the view count passes 10 and the window starts evicting.
- **Steps to reproduce (CLI):** send >10 views with clicks for one ad via the Node client, then grep `clicks_total` in the log.
- **Expected result:** a field named `…_total` is monotonic (never decreases).
- **Actual result:** `clicks_total` **decreases** when a view is evicted (e.g. 30 → 21) — it is the sum over the current 10-view window, not a lifetime total. Misleading when debugging from logs.

---

# Observations & open questions (unsure)

Things I noticed but did **not** confirm as bugs within the time box — recorded per the task's
"if you're unsure whether something is a bug, write it down too."

**Suspicious — worth a developer's eye (Medium):**
- **O-1 · Phantom click isn't 100% reliable.** In a 10-session run, 9/10 X-dismisses injected the
  click, one didn't — if it's timing-dependent, the `vtc` inflation is *variable* and harder to spot.
- **O-2 · `used_defaults=false` while `platform` is unreadable.** The panel shows `used_defaults:
  false`, yet the misspelled key means the SDK must be defaulting. If this is the signal ops trust,
  BUG-2 is invisible in monitoring — possibly a second defect layered on BUG-2.
- **O-3 · `vti` rides on a random installs simulator** (0/1/2 per view, non-monotonic). Not
  reproducible for the same real-world state — questionable as a published KPI (may be task-only).
- **O-4 · Ad overlay is dropped on background.** Backgrounding during an ad returns to home on
  resume (rotation preserves it). Impressions don't inflate (tested), but silently ending an open
  session is a product/accounting question.

**Untested edges (would test next):**
- **O-5 · Writer accepts arbitrary `platform`?** Config validates platform (→400), but the writer
  was only driven with `android`/`ios`. Junk values (`windows`, ``) could fragment metrics silently.
- **O-6 · Optional-field semantics** (`View` w/o `ad`, `Click` w/o `id`) — probed, but the signal is
  entangled with BUG-3's `UNAVAILABLE`; retest once BUG-3 is fixed.
- **O-7 · Click retry idempotency** — View retries don't double-count; a retried Click was never
  observed, so its dedup behaviour is unknown.

**Could not test (missing hooks):**
- **O-8/9 · `sample_rate` / `enabled_event_types`** — the config is static, so the SDK's
  sampling/gating branches can't be exercised end-to-end.
- **O-10 · Config cache/refresh policy** — no on-device hook to observe the once-per-launch cache.
- **O-11 · Live toast text** — the malformed template is proven at the config/panel level (BUG-4);
  the actual rendered toast on X-dismiss wasn't captured (transient on API 34).

**Verified correct (negative findings — recorded so they're not re-tested):**
- Config errors: missing/invalid platform → `400`, unknown route → `404`; response shape matches spec.
- Click without a preceding view → rejected (`FAILED_PRECONDITION`), not counted.
- Duplicate view for one id → rejected (`ALREADY_EXISTS`), window holds one view.
- Views & clicks are windowed **consistently**; the 11th view evicts a session *and its clicks*.
- Per-platform isolation holds; each "View ad" tap starts a new session id.
- Rotation / background-foreground do **not** duplicate an impression.

---

# Potential improvements

**Reliability / correctness**
- Validate the config response against its own OpenAPI schema before serving — would auto-catch the `platfrom` and `{n}` typos (BUG-2, BUG-4).
- Remove (or document) the writer's deterministic UNAVAILABLE-on-first-attempts behaviour (BUG-3) — it adds latency and hides a data-loss risk.
- Make `used_defaults` reflect **per-field** fallback (it stays `false` while `platform` silently defaults), so monitoring can detect BUG-2-class drift.

**Observability**
- Structured/JSON logs with a versioned schema — today every log-based check is substring-parsed and brittle.
- Rename `clicks_total` → `clicks_in_window` (BUG-5) to match its actual semantics.
- Log the platform the SDK **resolved to**, not just the request platform, to surface attribution drift.

**Testability (unlocks coverage)**
- Configurable ad id (debug intent extra) — lets UI e2e assert ratios by ad instead of only at the backend tier.
- Seedable install simulation — makes `vti` assertable to an exact value, not just an invariant.
- Config "test mode" (override `sample_rate` / `enabled_event_types`) — unlocks the untested SDK sampling/gating branches.

**UX / product**
- On foreground, restore or explicitly end the ad session — currently the overlay is silently dropped on background (PB-16); impressions are safe, session accounting is unclear.
- Debounce rapid "View ad" / ad taps to avoid accidental duplicate events.

**Contract hygiene**
- Remove the undocumented `debug_flags` field from the response, or add it to the spec.
