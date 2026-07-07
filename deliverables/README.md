# QA Test Task — Submission

End-to-end testing of the ad-tracking system (Android SDK app + writer/reader/config backend).
Found **5 bugs** (2 Critical), verified spec-compliant behaviours, and built a two-tier
automation suite (**28 automated checks**).

## Approach

The task suggested mostly **manual** checking of the Android app; I took it as a chance to build
**proper end-to-end automation** instead. Honest caveat: this is a working proof of the approach —
a production-grade version would need considerably more setup.

An ad SDK has two sides that matter: the ad must **display correctly**, and the events it fires
must be **recorded correctly** (the events are what the business runs on). I split the automation
to match:

- **Display / UI → Kaspresso** (UiAutomator), driving the real APK.
- **Event verification → an Appium-like agent** that gives the on-device tests access to the logs
  the backend writes, so each UI action is checked against what was actually recorded.

The core **vtc / vti** ratios can't be isolated from the UI (the ad id is pinned to `ad-001`), so
those are covered by **Playwright** tests against the backend. Full version in `00-test-report.md`.

## Deliverables

| File | What |
|---|---|
| [`00-test-report.md`](00-test-report.md) | **Test report** — approach, strategy & risks, coverage, investigation notes |
| [`01-bug-reports.md`](01-bug-reports.md) | Prioritised bug reports (compact) + potential improvements |
| [`02-bug-ticket-phantom-click.md`](02-bug-ticket-phantom-click.md) | Detailed ticket for the top bug (BUG-1) |
| [`03-ai-usage-disclosure.md`](03-ai-usage-disclosure.md) | AI usage disclosure |

## Findings

| # | Sev | Bug |
|---|---|---|
| BUG-1 | P0 | Closing the ad via the **X** records a phantom Click (inflates `vtc`) |
| BUG-2 | P0 | Config returns misspelled `platfrom` → iOS events attributed to Android |
| BUG-3 | P1 | `View` returns UNAVAILABLE on first attempts (breaks the provided example test) |
| BUG-4 | P2 | `session_ended` template `"…{n clicks"` — broken `{n}` placeholder |
| BUG-5 | P2 | `clicks_total` log field is windowed but named like a lifetime total |

## Frameworks & why

- **Playwright + TypeScript** (`e2e/`) — backend tier (gRPC writer/reader + REST config). It's
  the task's starter harness; tests isolate by **unique ad per test**, so they're fast,
  deterministic, and need no reset.
- **Kaspresso + UiAutomator** (`android-tests/`) — Android UI tier. A convenient harness: it
  wraps `adb`, works with device logs/logcat, and adds a step DSL, flaky-safety, and Allure on
  top of UiAutomator. Here it drives the app **black-box** by text/content-desc, because Espresso
  can't instrument a foreign *release* APK (no source or signing key). **With access to the app
  source** we could go finer-grained — Espresso-level view assertions and direct SDK hooks instead
  of black-box selectors.
- **Python `log-agent`** — the instrumentation runs on the emulator, which can't read the host
  filesystem; the agent serves/clears `writer/reader/config` logs and runs reader reads over
  `10.0.2.2`.
- **Allure** — reporting; Kaspresso steps become Allure steps, tests carry `@Issue`/`@Description`.
- **Docker Compose** — the backend stack.

## How to run

**Backend** (required for all tests):
```sh
cd backend && ./images/load.sh && docker compose up -d      # ./reset.sh to wipe state
```

**Backend tests** (Playwright — no emulator needed):
```sh
cd e2e && npm install && npx playwright test                # 17 tests
```

**Android tests** (needs a running emulator — Pixel 6 / API 33 recommended — and JDK 17):
```sh
# one-time: point Gradle at your Android SDK (local.properties is machine-specific and not shipped)
cd android-tests
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # or export ANDROID_HOME=<sdk path>
./run-e2e.sh                                                   # full cycle: docker→install→test→Allure
```
`run-e2e.sh` resets the backend, installs the APKs, runs the tests, generates + opens the
Allure report, and uninstalls afterwards (`NO_OPEN=1` to skip opening). If the paths at the top of
`run-e2e.sh` (adb / emulator / JDK 17) differ on your machine, adjust them there.

> **Note on artifacts:** generated outputs are not shipped — `npm install` restores `e2e/node_modules`,
> and Gradle rebuilds `android-tests/app/build` on first run (the Gradle **wrapper** is included, so no
> Gradle install is needed).

## Notes

- **4 tests are intentional red guards** (BUG-1..4) — via `test.fail()` (Playwright) and a real
  exit code (Android). They pass once the bug is fixed; that's the regression signal.
- **Isolation:** backend tests by unique ad, Android tests by session id + log-clear in teardown.
- The provided `e2e/tests/example.spec.ts` fails out of the box — that failure **is** BUG-3.
