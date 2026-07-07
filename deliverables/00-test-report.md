# Test Report — Adjoe Ad-Tracking System

**Author:** Dmitrii Vokuev · **Date:** 2026-07-06
**Scope:** Android QA Test App (`io.adjoe.qatest`) + backend writer / reader / config services.
**Companion deliverables:** bug ticket → `02-bug-ticket-phantom-click.md` · prioritised list →
`01-bug-reports.md` · AI disclosure → `03-ai-usage-disclosure.md`.

---

## 1. Introduction & approach

The task asked me to lean on **manual** checking of the Android app. I saw a good opportunity
to build **proper end-to-end tests** instead, so that's the path I took. Up front, honestly:
in the real world these tests need much more preparation and the complexity grows several times
over — what's here is a working proof of the approach, not a production-grade harness.

An ad SDK has **two sides that matter**:

1. **The ad displays correctly**, and
2. **the events it fires are recorded correctly** — the events are what the customers' business
   is built on.

I split the automation to match:

- **Display / UI behaviour → Kaspresso** (UiAutomator under the hood), driving the real APK.
- **Event verification → an Appium-like setup.** Claude helped me write a small **agent** that
  gives the on-device tests access to the logs the backend writes, so I could check each UI
  action against what was *actually* recorded.

The one thing I couldn't fully verify this way is the core **vtc / vti** ratios: the app's UI
doesn't let you set the **ad id**, so I can't isolate a clean ad from the device (everything is
pinned to `ad-001`). For that I wrote **Playwright** tests directly against the backend, using
the gRPC hooks the starter already ships.

## 2. Strategy & risks

**Strategy.** Requirement-driven and two-tier. I first pulled every requirement out of the docs
(README, OpenAPI spec, proto) and built the suite from that checklist — each test maps back to a
requirement. Modules were risk-ranked by blast radius on the product's reason to exist, *accurate
ad metrics*:

1. **Event counting (writer + reader)** — highest risk; a miscount corrupts every downstream number.
2. **Config / platform attribution** — high; a wrong `platform` mis-attributes every event.
3. **App UI / SDK** — medium, but it's the *source* of events, so UI bugs flow into (1).

Each tier does what only it can: the UI tier proves the app emits the right events and survives
lifecycle changes; the backend tier proves the ratio math, the sliding window, and the config
contract — the parts the pinned ad id keeps out of reach from the UI.

**Risks / limitations (known going in):**

- **Ad id is hardcoded (`ad-001`).** UI tests can't isolate reader metrics by ad, so vtc/vti
  value checks had to move to the backend tier. A debug hook for the ad id would fix this.
- **`installs` are simulated randomly** → `vti` is only checkable as an invariant, not an exact value.
- **BUG-3 (writer returns `UNAVAILABLE`)** contaminates every write-path test and forced retry
  wrappers everywhere — the highest-leverage fix for testability.
- **Emulator profile:** ran on API 34, task recommends API 33; findings reproduce at the backend
  layer, but some UI behaviour can be profile-sensitive.
- **Black-box e2e against a foreign release APK** (no source, no signing key) is inherently more
  fragile than an in-house harness — see the note in §1.

## 3. What I tested

**Backend tier — Playwright (`e2e/tests/`), isolated by a unique ad per test:**
- vtc/vti math as invariants (`value == other/views`) and exact values where clicks are controllable;
- sliding-window eviction (11th view evicts the oldest session *and its clicks*);
- writer semantics (click-without-view rejected, duplicate view deduped);
- per-platform isolation (android vs ios don't mix);
- config contract vs the OpenAPI spec (platform key, `{n}` template, 400/404, response shape).

**UI tier — Kaspresso + UiAutomator (`android-tests/`), each action checked against the log:**
- view/click emission (1 tap → 1 event, N taps → N clicks);
- each "View ad" tap starts a new session;
- the phantom-click isolation (X vs Back);
- lifecycle robustness (rotation, background/foreground don't duplicate an impression);
- the cached-config `session_ended` template shown on the status panel.

**Verified correct (negative findings):** config error handling (400/404), retry non-double-counting,
consistent view+click windowing, click-without-view & duplicate-view rejection, platform isolation.

## 4. Findings summary

Five defects, two Critical. Full detail + repro in `01-bug-reports.md`; the top one is ticketed
in `02-bug-ticket-phantom-click.md`.

| # | Sev | Defect |
|---|---|---|
| BUG-1 | P0 | Closing the ad via the **X** records a phantom **Click** → inflates `vtc` on every session |
| BUG-2 | P0 | Config returns misspelled `platfrom` → iOS events silently attributed to Android |
| BUG-3 | P1 | `View` returns `UNAVAILABLE` on first attempts → breaks the provided example test |
| BUG-4 | P2 | `session_ended` template `"…{n clicks"` — broken `{n}` placeholder |
| BUG-5 | P2 | `clicks_total` log field is windowed but named like a lifetime total |

## 5. Investigation notes

- **BUG-1, isolated with a control experiment.** Three ad taps produced four clicks, every run.
  Rather than assume, I contrasted dismissal methods with **zero** ad taps: **X → 1 click**,
  **Back → 0 clicks**. The X's tap falls through to the ad creative (its hit-box sits inside the
  creative's bounds). End-to-end proof: 10 no-tap sessions → reader `vtc = 0.9`, should be `0.0`.
- **The ratio formula was derived, not assumed.** The proto's "zero rather than undefined when no
  views exist" implies views is the denominator ⇒ `vtc = clicks/views`, `vti = installs/views`;
  confirmed against `reader.log`.
- **A hypothesis I discarded.** Early on the theory was "clicks grow unbounded, so vtc inflates
  forever." A longer log disproved it — `clicks_total` *decreases* on eviction, so clicks are
  windowed too. I dropped it rather than report an unreproduced claim.
- **BUG-2 is invisible from the app.** On an android emulator the default masks it; it only shows
  by reading the contract (`platfrom` vs `platform`), which is why it lives in the backend tier.

## 6. Automation — where it is and what it guards

- **`e2e/tests/`** (Playwright, backend) — 17 checks. Guards the ratio math, sliding-window
  eviction, writer semantics, platform isolation, and the config contract. Three are `test.fail()`
  guards for confirmed bugs (BUG-2/3/4) — they go green when fixed.
- **`android-tests/`** (Kaspresso + UiAutomator, run via `./run-e2e.sh`) — 11 checks. Guards event
  emission, session identity, lifecycle robustness, and pins BUG-1 (phantom click) and BUG-4
  (`{n}` template) as red guards. Reporting via Allure; each test cites the requirement it guards.

**Regression these guard:** any change that re-introduces the phantom click, the platform typo,
the broken toast template, the writer flakiness, or that breaks the windowed ratio math will turn
a currently-green test red (or fail to flip a red guard green).

## 7. What I deliberately skipped

- **iOS device testing** — the app pins android; BUG-2 is proven at the contract layer instead.
- **`sample_rate` / `enabled_event_types` SDK branches** — the config is static, so these can't be
  driven end-to-end without a config test mode.
- **Load / perf** — out of scope for a correctness pass.

Time is finite; I spent it proving the bugs that move the metric and codifying the checks worth
guarding, and I've been explicit about where the approach would need real investment to harden.
