import * as fs from "fs";
import * as path from "path";
import { expect } from "@playwright/test";

// Shared test helpers for the backend-level suites.

export const READER_LOG = path.resolve(
  __dirname,
  "../../backend/logs/reader.log",
);

let adCounter = 0;

/**
 * Unique ad id per test. Each (ad, platform) pair has its own sliding window,
 * so a fresh ad fully isolates a test from prior state — no server reset needed.
 */
export function freshAd(prefix = "auto"): string {
  adCounter += 1;
  return `${prefix}-${Date.now()}-${adCounter}`;
}

/**
 * The writer deterministically returns UNAVAILABLE on the first attempts of a
 * View (BUG-3). The SDK masks this with its retry policy; raw gRPC has no
 * retry, so writes go through this wrapper. NOTE: the request id must be
 * computed OUTSIDE the closure — the writer counts attempts per id, so a new
 * id on every retry would never succeed.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  tries = 4,
  backoffMs = 100,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, backoffMs * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * The reader's gRPC response only carries `value`; the operands it used
 * (`views`, `other`) are logged to reader.log. Reading them back lets tests
 * verify the arithmetic, not just the published number.
 */
export function lastReaderLine(
  type: string,
  ad: string,
): { views: number; other: number; value: number } {
  const lines = fs.readFileSync(READER_LOG, "utf8").split("\n");
  const matches = lines.filter(
    (l) => l.includes(`type="${type}"`) && l.includes(`ad="${ad}"`),
  );
  const line = matches[matches.length - 1];
  expect(line, `no ${type} line for ${ad} in reader.log`).toBeTruthy();
  const num = (re: RegExp) => Number(line.match(re)![1]);
  return {
    views: num(/views=(\d+)/),
    other: num(/other=(\d+)/),
    value: num(/value=([\d.]+)/),
  };
}
