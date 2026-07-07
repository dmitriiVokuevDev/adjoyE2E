# BUG-1 — Closing the ad overlay via the "X" records a phantom Click event

- **Severity / Priority:** Critical / P0
- **Component:** Android SDK — ad overlay dismiss handling (event attribution)
- **Affects:** All platforms, every ad session closed via the X (the documented normal close)
- **Status:** Reproducible, root-caused, end-to-end impact confirmed
- **Reported by:** Dmitrii Vokuev · 2026-07-05

---

## Summary

Dismissing the full-screen ad overlay by tapping the **X** in the corner emits a spurious
`Click` event to the writer, in addition to closing the overlay. The user never clicked the
ad, but the backend records a click. Because the X is the normal way to end a session, this
inflates the click count of **essentially every session by exactly 1**, corrupting the core
`vtc` (view-to-click) metric that this product exists to measure.

## Impact

- `vtc = clicks / views` is systematically over-reported. For the common single-click
  session, the reader reports **2 clicks instead of 1 (a 100% error)**.
- **Proven end-to-end:** 10 complete sessions were driven with **zero** ad taps; the reader
  then reported **`vtc = 0.9`** for that ad, when the ground-truth value is **`0.0`**. The
  click KPI is almost entirely fabricated by this bug.
- Advertisers are billed / optimised against click-through metrics; inflated clicks mean
  incorrect performance reporting and potentially incorrect spend decisions.

## Environment

- App: `io.adjoe.qatest` v1.0 (signed release APK from the task).
- Emulator: `sdk_gphone64_arm64`, API 34. (Also expected on API 33 — the bug is in event
  attribution, not rendering.)
- Backend: task Docker stack (writer :8081, reader :8082), default config.

## Steps to reproduce (manual)

1. `tail -f backend/logs/writer.log`.
2. Launch the QA Test App.
3. Tap **View ad** to open the overlay. (A `View` event is logged — expected.)
4. **Do not tap the ad.** Tap the **X** to close.
5. Observe `writer.log`.

**Actual:** a `Click` event is logged for the session id, e.g.

```
rpc=View  ... id="e1987aad-…" attempt=3 result=ok   window_size=10
rpc=Click ... id="e1987aad-…" result=ok clicks_for_view=1 clicks_total=26
```

**Expected:** no `Click` event — the ad was never tapped.

## Root cause (isolated)

The X hit-box `[945,209]–[984,295]` lies **inside** the ad creative's clickable bounds
`[0,136]–[1080,2337]` (from `uiautomator dump`). The dismiss tap is therefore also delivered
to the ad creative, which fires a click before/alongside the close. Confirmed by contrasting
dismissal methods with **zero** ad taps:

| Dismiss method | Clicks recorded |
|---|---|
| **X** (taps inside the creative) | **1** (bug) |
| System **Back** (no touch on the creative) | **0** (correct) |

Dismissing with Back records no click; only the X does. This localises the defect to the
X's touch target overlapping the creative's, and rules out "opening the overlay emits a
click" (open + Back = 0 clicks).

## Suggested fix

Ensure the close control consumes its touch event and does not forward it to the ad creative
— e.g. make the X an opaque, top-most view that calls `stopPropagation`/consumes the event,
or shrink/relayer the creative's clickable region so it does not sit under the X. Add a
regression check asserting that dismiss-via-X produces **0** clicks (see below).

## Automated regression (included)

`android-tests/` (Kaspresso + UiAutomator):

- `FullScreenAdChecks#closing_with_x_must_not_record_a_click` — open → close via X, assert 0
  clicks recorded in `writer.log` for the session. **Fails today; passes when fixed.**
- `FullScreenAdChecks#three_ad_taps_produce_three_click_events` — the positive path (Back close),
  showing tracking is correct when the X is not involved — proves the extra click is the X's.

Run: `cd android-tests && ./run-e2e.sh` (drives the real app, then correlates against the log).
