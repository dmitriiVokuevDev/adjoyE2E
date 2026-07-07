# AI Usage Disclosure

I drove the testing and spotted the odd behaviour myself; I used Claude Code to chase down the
*cause* of what I noticed and to build the automation. What to test and what counts as a bug
stayed mine.

## Tools used

- **Claude Code (Anthropic CLI), Claude Opus 4.8** — throughout.
- Standard toolchain it drove: `adb`/UiAutomator, Docker, `curl`, a Node gRPC client, Gradle,
  Kaspresso, Playwright.

## Where I used them

- **Setup:** checked tooling, caught JDK 25 vs AGP and installed JDK 17, extracted the APK's
  package/activity, confirmed emulator/Docker health.
- **SDK exploration:** ran `uiautomator dump` for selectors; when I saw the `session_ended`
  text looked wrong, it helped confirm it against the OpenAPI spec.
- **Backend log investigation:** the ratios in `writer.log` didn't match what I'd sent — it
  helped parse the logs and reconcile the sliding-window math. It also proposed a *wrong* cause
  ("clicks grow unbounded") that I dropped once more data disproved it.
- **Test strategy + write-up:** I had it pull every requirement from the docs (README / OpenAPI
  / proto) so I could build the suite from a checklist (→ traceability matrix); it suggested
  extra corner cases (duplicate view, click-without-view, platform isolation, rotation /
  background). Risk ranking and what to guard were mine.
- **Bug ticket + prioritisation:** drafted from my findings; the priorities are mine.
- **Automation add-on:** it built the two-tier suite (Kaspresso/UiAutomator + Python log-agent
  + Allure, and the Playwright backend tests) and the X-vs-Back experiment that traced the
  extra click to its cause.

## Where I deliberately didn't use AI

- **Tool choice + approach:** Kaspresso/Kotlin for UI, Playwright for backend, the two-tier
  split — mine; Claude implemented.
- **Noticing what to investigate:** the anomalies I spotted while driving the system — Claude
  explained *why*, not *what*.
- **What counts as a bug + its priority:** mine.
- **Accepting a finding:** only after it reproduced live, not from reasoning.

## Honest reflection

AI was fast at chasing a cause I'd already spotted and at standing up a harness against a
source-less APK. It also nearly sold me a plausible-but-wrong theory ("unbounded clicks") until
we reproduced it — so my rule was: it can hypothesise and build, but nothing is a *finding*
until I've watched it happen. Left alone it's eager to agree and would have shipped that wrong
theory; the value was in pushing back — making it reproduce, run controls, and audit its own
tests. That's the part I'd want judged as mine.
