# Senior QA Engineer, Test Task

This task asks you to test an ad-tracking system end-to-end. You'll run a small Android test app that drives the SDK, a backend that tracks events, and a config service that the SDK consults on launch. Your job is to test the system, find bugs, and report them clearly.

## Description

Our company is building a product that tracks the performance of ads running on mobile devices. We have an Android SDK that communicates with the backend via gRPC. The backend tracks three types of metrics:

- **views**, a view event happens every time a user watches an ad on their device. An ad can have at most one view per session.
- **clicks**, a click event happens every time a user clicks on an ad they are watching. An ad can have multiple clicks per session.
- **installations**, an installation event happens when a user installs the advertised app. The SDK does not send these; the backend receives them from a third party. (Simulated automatically in this task.)

The metrics are counted per ad per platform (the same ad can run on `android` and `ios`, with different metrics for each). Every event (view and click) has an `id` shared across all events in the same ad session: one view and any number of clicks all share an `id`. Views are stored in a sliding window of size 10 per ad/platform, once 10 views exist, the oldest is evicted by the next.

The backend also exposes a service for retrieving current statistics: either the view-to-click ratio (`vtc`) or the view-to-installation ratio (`vti`) for a given ad on a platform.

In addition to the gRPC services, an HTTP **config service** serves the client configuration that the SDK fetches on app launch. The SDK uses this config for platform attribution and UI text. The contract for this service is published as an OpenAPI specification you can browse in your local Swagger UI.

If the ratios you observe in the reader don't match what you'd expect from the events you sent, that's a useful starting point. Investigate.

## How the test app works

The test app has a single home screen with a **View ad** button and a status panel. Tapping View ad sends a view event and opens a full-screen ad overlay. Inside the overlay:

- Tapping the ad itself sends a click event tied to the same session.
- Tapping the **X** in the corner closes the overlay and returns you to the home screen. A brief toast confirms what just happened.

Every fresh tap of View ad starts a new session, new id, new view, new overlay, so you can run multiple full flows per app launch.

Further details:

- Ads are identified by a unique string ad-ID.
- Platform identifiers are `android` and `ios`.
- The test app pins the platform per device, emulators identify as `android` by default.

## Methodology

This is a manual testing task. Drive the Android app on the emulator, observe what happens, cross-reference against the backend logs and the config response, and decide what's worth reporting. The backend services and the config endpoint can be exercised directly with `grpcurl`, `curl`, Postman, or whatever you reach for, useful for isolating signals you saw through the UI.

Automated tests are a **bonus**, not the main path. The Android UI itself cannot be driven from the Playwright starter, Playwright runs a backend-only TypeScript client (gRPC for the writer/reader, `fetch` for the config service) and is useful only for codifying a backend-level regression check. If you reach for it, one or two thoughtful tests against the backend are worth more than a broad suite. Skipping automation entirely is fine and is not penalised, a senior QA decides what to invest in, and that decision is part of what we're evaluating.

## Your tasks

### Test the system
Verify that the system meets the requirements described above and describe the bugs you find. If you're unsure whether something is a bug, write it down too.

### Write a test report
A short report detailing what you tested and how, so a developer, lead, or other QA can understand which scenarios you covered and the outcome of each. Quality of thinking matters more than length.

### Write a bug ticket
For one bug you found, write a ticket with enough detail that a developer or lead could prioritise it and start a fix without follow-up questions.

### Prioritise the bugs
Give every bug you found a priority and a brief justification.

## What's in this folder

- `backend/` — docker-compose stack (Redis + writer + reader + config + Swagger UI), prebuilt service images, proto files, log directory
- `android/` — signed APK for the test app, plus emulator setup notes
- `e2e/` — TypeScript starter for optional automation
- `templates/` — one template for the AI usage disclosure. Other deliverables are your call on format.

## Running

### 1. Backend

The writer, reader, and config services ship as prebuilt Docker images. Load them once, then bring the stack up:

```sh
cd backend
./images/load.sh
docker compose up -d
```

This starts five services:

| Service | Port | Purpose |
|---|---|---|
| `redis` | (internal) | Backing store for writer/reader |
| `writer` | 8081 (gRPC) | Receives view and click events |
| `reader` | 8082 (gRPC) | Returns vtc / vti ratios |
| `config` | 8083 (REST) | Serves client config on app launch |
| `swagger-ui` | 8084 (HTTP) | Renders the config service's OpenAPI spec |

Logs stream to `backend/logs/{writer,reader,config}.log` (bind-mounted from the containers).

### 2. Android emulator

See `android/AVD-RECOMMENDED.md`. Short version:

1. Android Studio → Device Manager → create AVD with Pixel 6, API 33, x86_64.
2. Start the emulator.
3. `adb install android/app-release.apk`
4. Launch the test app. It's pre-configured to reach the local backend at `10.0.2.2:{8081,8082,8083}`.

### 3. Smoke check

```sh
# writer (gRPC)
grpcurl -plaintext \
  -import-path backend/proto -proto writer.proto \
  -d '{"platform":"android","ad":"ad-test","id":"view-1"}' \
  localhost:8081 writer.WriterService/View

# config (REST)
curl -s 'http://localhost:8083/config?platform=ios&app_id=test-app' | jq .
```

Open the app on the emulator, tap **View ad**, then tap the ad in the overlay, then X out — check `backend/logs/writer.log` for the corresponding view and click events.

## Time

We expect this to take around **4 hours of focused work**. You have a **3-day submission window** to fit setup, investigation, and write-up around your schedule. Don't try to do everything. A senior QA decides what to skip, and that decision is part of what we're looking at.

## What to send back

A single zip containing the four deliverables below. Format is your call — Markdown, PDF, a ticket export, or plaintext are all fine. We're evaluating structure and content, not adherence to any template.

1. **A test report** — what you tested, your overall strategy, risk-ranked modules, findings summary, investigation notes. Quality of thinking over exhaustive coverage.
2. **A bug ticket** — one detailed ticket for the bug you consider most important, in whatever format a developer or lead would need to prioritise and fix without follow-up questions.
3. **A prioritised list** — every issue you found, with a priority and a brief justification per item.
4. **An AI usage disclosure** — see `templates/ai-disclosure.md` for the questions we want answered. This is the one deliverable with a specific structure, because we compare disclosures across candidates.

Optionally, include a `tests/` folder inside `e2e/` with one or two automated checks against the backend. This is a bonus, not a requirement — we'd rather see no automation than padding. If you do include automation, point us at it in your test report and explain what regression you're guarding against.

## A note on AI tools

We expect most candidates will use AI tools. That's fine. Tell us where you used them and what they helped with. Specific, honest disclosure is graded positively. Vague disclosure is graded negatively.

## Questions

If something is unclear or genuinely blocking you, reach out to your recruiter. Some ambiguity is intentional, part of the task is deciding what to do under uncertainty.

Good luck.
