# Automation Starter, TypeScript + Playwright

**Optional.** This is a bonus add-on, not the main testing path. Most of the task is intended to be done manually, driving the Android app on the emulator and cross-referencing against the backend logs and the config response. The starter here exists in case you want to codify a regression check against the backend; it is not required.

**What this starter does and doesn't do.** The TypeScript client targets the backend services directly, gRPC for the writer (`:8081`) and reader (`:8082`), and `fetch` for the config service (`:8083`). It does **not** drive the Android UI; Playwright cannot interact with the emulator. If you reach for this, it is for codifying a backend-level regression check (e.g. "view + click + read returns the expected ratio"), not for replacing manual UI testing.

We use Playwright's test runner as a familiar harness; the actual calls go through a minimal gRPC client (for writer/reader) and a `fetch`-based REST client (for config). The starter ships with:

- A configured gRPC client targeting `localhost:8081` (writer) and `localhost:8082` (reader)
- A `fetchConfig()` helper targeting `localhost:8083`
- An example test that sends a view and reads back a ratio
- Sensible TypeScript and Playwright configuration

## Setup

```sh
cd e2e
npm install
npx playwright install --with-deps   # optional, only if you use browser features
```

## Running

```sh
npx playwright test
```

Or run a single file:

```sh
npx playwright test tests/example.spec.ts
```

## Writing your own checks

The intent of automation in this task is to demonstrate how you think about regression coverage, not to ship a full suite. One or two thoughtful tests beats five shallow ones.

Reasonable starting points:

- A happy-path test: send a view, send a click with the same id, read the vtc ratio.
- A regression test for a bug you found, with assertions that would fail if the bug returned.
- A contract check: fetch the config and assert the response matches what the OpenAPI spec at <http://localhost:8084/> says it should.

Place your tests under `tests/`. They are picked up automatically by the runner.

## Files

| File | Purpose |
|---|---|
| `src/client.ts` | gRPC client (`view()`, `click()`, `read()`) and REST helper (`fetchConfig()`) |
| `src/types.ts` | TypeScript types for the proto messages and `ClientConfig` |
| `tests/example.spec.ts` | One worked example you can copy from |
| `playwright.config.ts` | Test runner configuration |
| `package.json`, `tsconfig.json` | Standard project metadata |
