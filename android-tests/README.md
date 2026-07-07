# Android UI Automation — Kaspresso + UiAutomator

Black-box UI automation for the QA Test App (`io.adjoe.qatest`) that drives the **real app**
and correlates each UI action against the backend `writer.log`.

## Why UiAutomator, not Espresso

We only have the **signed release APK** — no source, no signing key. Espresso (and Kaspresso's
Espresso DSL) inject into the app's own process and require both. So this harness uses
**Kaspresso's UiAutomator path**, which drives any app black-box via the accessibility layer.
The app exposes **no resource-ids**, so selectors are by visible text / content-description
(discovered with `uiautomator dump`).

## System interaction

Everything runs on one host (your Mac). The instrumentation test lives **inside the emulator**;
the app-under-test, the backend, and the log-agent are separate processes it talks to. The
emulator reaches every host process through the special loopback address **`10.0.2.2`**.

```
HOST (macOS)
│
├─ run-e2e.sh ............. orchestrator: emulator ▸ docker ▸ agent ▸ install ▸ run ▸ Allure ▸ cleanup
│
├─ Android emulator ─────────────────────────────────────────────────────────────────┐
│    androidTest APK  (Kaspresso instrumentation, self-instrumenting)                  │
│      ├─ AdjoeTestApp ........ UiAutomator driver — taps by text / content-desc        │
│      ├─ WriterLog / Reader .. HTTP clients to the log-agent                           │
│      └─ drives ▼                                                                      │
│    QA Test App (io.adjoe.qatest) ....... the app under test (View/Click, config)      │
└──────────────────────────────────────────────────────────────────────────────────────┘
│                    │ (1) gRPC/REST                 │ (2)(4)(6) HTTP
│                    │  via 10.0.2.2                 │  via 10.0.2.2
├─ Docker network ───▼───────────────────┐   ┌──────▼───────────────────────────────────┐
│    writer :8081 ─┐                      │   │  log-agent.py :8090  (host, NOT docker)   │
│    reader :8082 ─┼─▶ redis :6379        │   │    GET  /log/<svc>     → serve *.log       │
│    config :8083 ─┘   (in-memory window) │   │    POST /clear/<svc>   → truncate *.log    │
│        │ (3) append 1 line / request    │   │    GET  /read?...      → node → reader gRPC│
│        ▼                                │   └──────┬──────────────────────┬─────────────┘
│    backend/logs/{writer,reader,config}.log ◀──────┘ (5) read/clear        │ (7) reader read
│        (host files, bind-mounted into the containers)                     ▼
└───────────────────────────────────────────────────────────────────▶ reader :8082 → redis
```

**Interaction flows** (each numbered arrow above):

1. **QA app → backend** — the app sends `View`/`Click` (gRPC → writer :8081) and fetches config on launch (REST → config :8083), via `10.0.2.2`. writer/reader read+write **redis** (10-view sliding window per ad/platform).
2. **test → log-agent** — `WriterLog`/`Reader` call `GET /log/*`, `POST /clear/*` over HTTP (`10.0.2.2:8090`).
3. **services → logs** — writer/reader/config append one line per request to `backend/logs/*.log` (bind-mounted from the containers to the host).
4. **agent serves logs** — the test reads the log back through the agent (the emulator can't read the host filesystem directly).
5. **agent clears logs** — `POST /clear/*` truncates the host log file (per-test isolation, in `@Before`/`@After`).
6. **test → reader (via agent)** — `Reader.ratio()` calls `GET /read`, the agent runs `node read-ratio.js`,
7. …which performs the **reader** gRPC read (:8082) → redis → returns `{value}`.
8. **results → Allure** — `run-e2e.sh` pulls Allure results from the app's `files/` and generates the report.

The **log-agent bridges the emulator↔host gap**: instrumentation runs on-device and cannot read
host files or open a reader channel as easily, so the agent (a ~90-line Python HTTP server on the
host) does it and exposes simple HTTP endpoints.

## Layout

```
app/src/androidTest/java/io/adjoe/qatest/uitests/
  AdjoeTestApp.kt              black-box driver: launch / open ad / tap ad / close (X|Back) /
                               rotate / background / foreground / read status panel
  WriterLog.kt                 clients for writer.log + reader.log/ratios via the host agent
  BaseUiTest.kt                Kaspresso base with Allure support enabled
  FullScreenAdChecks.kt        drive the app, then assert writer.log (view/click events)
  FullScreenVtcVtiChecks.kt    drive/read the reader, then assert reader.log (vtc/vti math)
  FullScreenAdLifecycleChecks.kt  rotate / background+foreground ⇒ impression not duplicated
log-agent.py                   host agent: serves + truncates writer/reader/config logs, runs reader reads
run-e2e.sh                     full cycle: emulator -> docker -> agent -> install -> instrument -> Allure
```

## Run lifecycle

Every `./run-e2e.sh` starts from a clean slate and cleans up after itself:

1. Ensure the emulator is up.
2. **Fresh backend**: `docker compose down -v` (wipe redis + logs) then `up`, wait for healthy.
3. Start the host log-agent.
4. **Fresh install**: uninstall any prior QA app / harness, then install clean.
5. Run the instrumentation tests.
6. Pull results and generate + open the Allure report (`NO_OPEN=1` to skip opening).
7. **Teardown**: uninstall the QA app, the harness, and the instrumentation.

Because redis is wiped each run, the reader tests seed their own window (drive a session)
before asserting — so they are independent of any pre-existing `ad-001` state.

## How the tests read the log

The instrumentation runs **on the emulator**, which cannot read the host filesystem or call
the reader as easily as the host can. So `log-agent.py` runs on the host and bridges both
over the emulator's host-loopback address (`10.0.2.2:8090`):

- `GET /log/<writer|reader|config>` — current contents of that log
- `POST /clear/<writer|reader|config>` — truncate that log to empty
- `GET /read?type=vtc&ad=ad-001&platform=android` — perform a reader gRPC read, return `{value}`

Each test **clears its log in `@Before`/`@After` (teardown)** for full isolation, drives the
app (or the reader), reads the log back, finds its own session id / operands, and asserts.

## Run

```sh
./run-e2e.sh          # full cycle, prints UI-vs-log correlation
```

Individual tests (the host log-agent must be running — `python3 log-agent.py &`):

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  ./gradlew :app:assembleDebugAndroidTest
adb install -r -g app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w \
  -e class io.adjoe.qatest.uitests.FullScreenAdChecks \
  io.adjoe.qatest.uitests.test/androidx.test.runner.AndroidJUnitRunner
```

## Tests and what they guard

**Writer / event tracking** (`FullScreenAdChecks`, asserts `writer.log`):

| Test | Guards | Today |
|---|---|---|
| `a_view_produces_exactly_one_view_event` | open→Back ⇒ 1 View, 0 Clicks | **GREEN** |
| `three_ad_taps_produce_three_click_events` | 3 taps (Back close) ⇒ 3 Clicks | **GREEN** |
| `each_view_ad_tap_starts_a_new_session` | 2 cycles ⇒ 2 distinct session ids | **GREEN** |
| `closing_with_x_must_not_record_a_click` | open→X, 0 taps ⇒ 0 Clicks | **RED** — catches BUG-1 (phantom click) |
| `cached_config_session_ended_..._placeholder` | panel `session_ended` contains `{n}` | **RED** — catches BUG-4 |

**Reader / ratios** (`FullScreenVtcVtiChecks`, asserts `reader.log`):

| Test | Guards | Today |
|---|---|---|
| `vtc_value_equals_clicks_over_views` | published vtc == `other/views`, views ≤ 10 | **GREEN** |
| `vti_value_equals_installs_over_views` | published vti == `other/views`, views ≤ 10 | **GREEN** |
| `vtc_and_vti_share_the_same_view_window` | both ratios use the same view count | **GREEN** |
| `ten_sessions_without_clicks_make_vtc_zero` | 10 no-tap sessions ⇒ reader vtc = 0.0 | **GREEN** (end-to-end) |

**Lifecycle robustness** (`FullScreenAdLifecycleChecks`, asserts `writer.log`):

| Test | Guards | Today |
|---|---|---|
| `rotating_during_ad_does_not_add_an_impression` | rotate while ad shown ⇒ impression unchanged | **GREEN** |
| `backgrounding_and_foregrounding_does_not_add_an_impression` | Home + reopen ⇒ impression unchanged | **GREEN** |

The green tests prove event tracking, reader math, and lifecycle robustness are correct in
isolation; the two red tests pin BUG-1 (phantom click on X) and BUG-4 (broken `{n}` template)
and turn green once those bugs are fixed.

## Allure report

Tests run under `AllureAndroidJUnitRunner` with Kaspresso's Allure support, so every
`step(...)` is an Allure step and a screenshot + logcat are attached on failure. `run-e2e.sh`
pulls the results and generates the report automatically. To view:

```sh
allure open android-tests/allure-report      # render the generated report
# or regenerate live from raw results:
allure serve android-tests/allure-results
```

## Requirements

- JDK 17 (AGP/Gradle incompatible with JDK 25). Path above.
- Android SDK w/ platform 34 + build-tools 35.
- A running emulator and the Docker backend (`run-e2e.sh` brings the backend up itself).
