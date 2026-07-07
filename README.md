# Adjoe — Senior QA Test Task

End-to-end testing of an ad-tracking system (Android SDK app + writer / reader / config backend).
Found **5 bugs** (2 Critical), verified spec-compliant behaviours, and built a **two-tier
automation suite** (28 automated checks).

> The original task brief is preserved in **[TASK.md](TASK.md)**.
> The full submission index is in **[deliverables/README.md](deliverables/README.md)**.

## ⚠️ Not included in this repo

The company's **compiled assets are intentionally excluded** (their IP; also keeps the repo
lean) — they are not committed, only `.gitignore`d:

- `backend/images/*.tar` — the prebuilt **writer / reader / config Docker images**
- `android/app-release.apk` — the **QA test app**

Both ship with the original task package. To run everything locally, drop them back into
`backend/images/` and `android/` respectively.

## Approach

The task suggested mostly **manual** checking of the Android app; I took it as a chance to build
**proper end-to-end automation** instead. Honest caveat: this is a working proof of the approach —
a production-grade version would need considerably more setup.

An ad SDK has two sides that matter: the ad must **display correctly**, and the events it fires
must be **recorded correctly** (the events are what the business runs on). The automation is split
to match:

- **Display / UI → Kaspresso** (UiAutomator), driving the real APK.
- **Event verification → an Appium-like agent** that gives the on-device tests access to the logs
  the backend writes, so each UI action is checked against what was actually recorded.

The core **vtc / vti** ratios can't be isolated from the UI (the ad id is pinned to `ad-001`), so
those are covered by **Playwright** tests against the backend.

## Deliverables

| File | What |
|---|---|
| [`deliverables/00-test-report.md`](deliverables/00-test-report.md) | Test report — approach, strategy & risks, coverage, investigation notes |
| [`deliverables/01-bug-reports.md`](deliverables/01-bug-reports.md) | Prioritised bug list + full repro + open questions |
| [`deliverables/02-bug-ticket-phantom-click.md`](deliverables/02-bug-ticket-phantom-click.md) | Detailed ticket for the top bug (BUG-1) |
| [`deliverables/03-ai-usage-disclosure.md`](deliverables/03-ai-usage-disclosure.md) | AI usage disclosure |

## Findings

| # | Sev | Bug |
|---|---|---|
| BUG-1 | P0 | Closing the ad via the **X** records a phantom Click (inflates `vtc`) |
| BUG-2 | P0 | Config returns misspelled `platfrom` → iOS events attributed to Android |
| BUG-3 | P1 | `View` returns UNAVAILABLE on first attempts (breaks the provided example test) |
| BUG-4 | P2 | `session_ended` template `"…{n clicks"` — broken `{n}` placeholder |
| BUG-5 | P2 | `clicks_total` log field is windowed but named like a lifetime total |

## Automation

- **`e2e/`** — Playwright + TypeScript backend suite (17 checks). See [`e2e/README.md`](e2e/README.md).
- **`android-tests/`** — Kaspresso + UiAutomator UI suite (11 checks). See [`android-tests/README.md`](android-tests/README.md).

## How to run

**Backend** (required — needs the excluded `*.tar` images restored):
```sh
cd backend && ./images/load.sh && docker compose up -d      # ./reset.sh to wipe state
```

**Backend tests** (Playwright — no emulator needed):
```sh
cd e2e && npm install && npx playwright test
```

**Android tests** (needs a running emulator — Pixel 6 / API 33 recommended — and JDK 17; needs the
excluded APK restored):
```sh
cd android-tests
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties   # or export ANDROID_HOME=<sdk path>
./run-e2e.sh                                                   # full cycle: docker→install→test→Allure
```

A few tests are intentional **red guards** for confirmed bugs (via `test.fail()` / a real exit
code) — they pass once the bug is fixed. See the deliverables for detail.
