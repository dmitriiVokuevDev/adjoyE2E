#!/usr/bin/env bash
#
# Full end-to-end cycle for the Adjoe QA test app.
#
#   1. ensure the Android emulator is up
#   2. ensure the Docker backend is up
#   3. start the host log-agent (serves/clears backend/logs/writer.log to the tests)
#   4. build + install the QA app and the Kaspresso/UiAutomator test APKs
#   5. run the instrumentation tests
#
# Correlation lives INSIDE the tests now: each test drives the app, finds its
# own session id, reads writer.log via the log-agent, asserts the recorded
# events, and clears the log in teardown.
set -uo pipefail

# ---- paths -------------------------------------------------------------------
SDK="/opt/homebrew/share/android-commandlinetools"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"
export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"

TASK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJ_DIR="$TASK_DIR/android-tests"
BACKEND_DIR="$TASK_DIR/backend"
WRITER_LOG="$BACKEND_DIR/logs/writer.log"

QA_APK="$TASK_DIR/android/app-release.apk"
APP_APK="$PROJ_DIR/app/build/outputs/apk/debug/app-debug.apk"
TEST_APK="$PROJ_DIR/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"

TEST_PKG="io.adjoe.qatest.uitests"
RUNNER="$TEST_PKG.test/io.qameta.allure.android.runners.AllureAndroidJUnitRunner"
AGENT_PORT=8090
ALLURE_RESULTS="$PROJ_DIR/allure-results"
ALLURE_REPORT="$PROJ_DIR/allure-report"

say() { printf "\n\033[1;36m== %s ==\033[0m\n" "$*"; }

AGENT_PID=""
cleanup() { [ -n "$AGENT_PID" ] && kill "$AGENT_PID" 2>/dev/null; }
trap cleanup EXIT

# ---- 1. emulator -------------------------------------------------------------
say "1. Android emulator"
if [ -z "$("$ADB" devices | sed -n '2p' | grep -w device)" ]; then
  AVD="$("$EMULATOR" -list-avds | head -1)"
  [ -z "$AVD" ] && { echo "No AVD available. Create one in Android Studio."; exit 2; }
  echo "Booting AVD: $AVD"
  "$EMULATOR" -avd "$AVD" -no-snapshot-save >/dev/null 2>&1 &
fi
"$ADB" wait-for-device
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
echo "Emulator ready: $("$ADB" shell getprop ro.product.model | tr -d '\r') (API $("$ADB" shell getprop ro.build.version.sdk | tr -d '\r'))"

# ---- 2. backend (fresh from scratch) -----------------------------------------
say "2. Docker backend (fresh: wipe redis + logs, recreate)"
( cd "$BACKEND_DIR" \
    && docker compose down -v >/dev/null 2>&1 \
    && rm -f logs/*.log \
    && docker compose up -d >/dev/null 2>&1 )
# wait until writer/reader/config report healthy
for _ in $(seq 1 60); do
  healthy=$(docker compose -f "$BACKEND_DIR/docker-compose.yml" ps --format '{{.Status}}' 2>/dev/null | grep -c healthy)
  [ "${healthy:-0}" -ge 3 ] && break
  sleep 1
done
docker compose -f "$BACKEND_DIR/docker-compose.yml" ps --format '  {{.Name}}: {{.Status}}' 2>/dev/null

# ---- 3. log-agent ------------------------------------------------------------
say "3. Host log-agent (serves writer.log to the tests over 10.0.2.2:$AGENT_PORT)"
NODE_BIN="$(command -v node)" python3 "$PROJ_DIR/log-agent.py" "$BACKEND_DIR/logs" "$AGENT_PORT" &
AGENT_PID=$!
sleep 1
curl -s -o /dev/null -w "  agent GET /log/writer -> HTTP %{http_code}\n" "http://localhost:$AGENT_PORT/log/writer"

# ---- 4. build + fresh install ------------------------------------------------
say "4. Build + fresh install APKs (uninstall any prior, then install clean)"
( cd "$PROJ_DIR" && ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest --console=plain -q ) || exit 1
for p in "$TEST_PKG.test" "$TEST_PKG" io.adjoe.qatest; do "$ADB" uninstall "$p" >/dev/null 2>&1; done
"$ADB" install -g "$QA_APK"   >/dev/null 2>&1 && echo "installed QA app          (io.adjoe.qatest)"
"$ADB" install -g "$APP_APK"  >/dev/null 2>&1 && echo "installed test harness    ($TEST_PKG)"
"$ADB" install -g "$TEST_APK" >/dev/null 2>&1 && echo "installed instrumentation ($TEST_PKG.test)"

# ---- 5. run tests ------------------------------------------------------------
say "5. Run instrumentation (each test drives the app, then checks the logs)"
"$ADB" shell run-as "$TEST_PKG" rm -rf files/allure-results 2>/dev/null
INSTRUMENT_LOG="$(mktemp)"
"$ADB" shell am instrument -w "$RUNNER" 2>&1 | tee "$INSTRUMENT_LOG" | sed 's/^/    /'

# `am instrument` exits 0 no matter what — derive the real verdict from output,
# otherwise this script reports success to CI even when tests fail.
TESTS_RC=0
if grep -q "INSTRUMENTATION_FAILED\|Process crashed" "$INSTRUMENT_LOG"; then
  TESTS_RC=2                                  # harness-level breakage
elif grep -q "FAILURES!!!" "$INSTRUMENT_LOG"; then
  TESTS_RC=1                                  # test failures
elif ! grep -q "OK (" "$INSTRUMENT_LOG"; then
  TESTS_RC=2                                  # no verdict at all
fi
rm -f "$INSTRUMENT_LOG"

# ---- 6. Allure report --------------------------------------------------------
say "6. Allure report"
rm -rf "$ALLURE_RESULTS" "$ALLURE_REPORT"
"$ADB" exec-out run-as "$TEST_PKG" tar c -C files allure-results 2>/dev/null | tar x -C "$PROJ_DIR" 2>/dev/null
if [ -d "$ALLURE_RESULTS" ] && command -v allure >/dev/null 2>&1; then
  allure generate --clean "$ALLURE_RESULTS" -o "$ALLURE_REPORT" >/dev/null 2>&1
  echo "  results: $ALLURE_RESULTS"
  echo "  report:  $ALLURE_REPORT/index.html"
  if [ "${NO_OPEN:-0}" = "1" ]; then
    echo "  open with:  allure open '$ALLURE_REPORT'   (or: allure serve '$ALLURE_RESULTS')"
  else
    # Serve the report and open it in the browser. Runs detached so this script
    # still exits; stop it later with:  pkill -f 'allure'   (set NO_OPEN=1 to skip).
    pkill -f 'allure open' 2>/dev/null   # drop any previous allure server
    nohup allure open "$ALLURE_REPORT" >/tmp/allure-open.out 2>&1 &
    sleep 3
    echo "  opened in browser: $(grep -o 'http://[0-9.:]*' /tmp/allure-open.out | head -1)"
    echo "  (stop the server with: pkill -f allure)"
  fi
else
  echo "  (allure CLI not found or no results pulled; install with: brew install allure)"
fi

# ---- 7. teardown: uninstall the app + test harness ---------------------------
say "7. Teardown: uninstall apps"
for p in "$TEST_PKG.test" "$TEST_PKG" io.adjoe.qatest; do
  "$ADB" uninstall "$p" >/dev/null 2>&1 && echo "  uninstalled $p"
done

if [ "$TESTS_RC" -eq 0 ]; then
  say "Result: all tests passed"
else
  say "Result: TESTS FAILED (exit code $TESTS_RC)"
  echo "  note: two tests are known-bug guards and stay red until fixed —"
  echo "    closing_with_x_must_not_record_a_click            (BUG-1, phantom click on X)"
  echo "    cached_config_session_ended_template_contains_...  (BUG-4, missing {n} in template)"
fi
exit "$TESTS_RC"
