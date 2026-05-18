import test from "node:test";
import assert from "node:assert/strict";
import { buildContainsClause, buildEqualityClauses, buildWhereClause, quoteIdentifierForFrom } from "../src/sql.js";
import { maskSensitiveData } from "../src/sanitize.js";
import { parseDurationToMicros, resolveTimeRange } from "../src/time.js";

test("buildContainsClause escapes keywords and quoted field names", () => {
  assert.equal(
    buildContainsClause("service.name", "can't-connect"),
    `str_match("service.name", 'can''t-connect')`,
  );
  assert.equal(
    buildContainsClause(undefined, "timeout"),
    "match_all('timeout')",
  );
});

test("buildEqualityClauses serializes string, number, and boolean filters", () => {
  assert.deepEqual(
    buildEqualityClauses({
      service_name: "api",
      status_code: 500,
      retryable: true,
      ignored: "",
    }),
    [
      `"service_name" = 'api'`,
      `"status_code" = 500`,
      `"retryable" = true`,
    ],
  );
});

test("buildWhereClause and quoteIdentifierForFrom produce bounded SQL fragments", () => {
  assert.equal(buildWhereClause([]), "");
  assert.equal(buildWhereClause(["a = 1", "b = 2"]), " WHERE a = 1 AND b = 2");
  assert.equal(quoteIdentifierForFrom('app"logs'), `"app""logs"`);
});

test("maskSensitiveData recursively masks configured fields", () => {
  const result = maskSensitiveData({
    service: "api",
    token: "secret-value",
    nested: {
      Authorization: "Bearer 123",
      password: "p@ss",
    },
    items: [
      { api_key: "abc" },
      { ok: true },
    ],
  }, ["token", "authorization", "password", "api_key"]);

  assert.deepEqual(result, {
    service: "api",
    token: "***",
    nested: {
      Authorization: "***",
      password: "***",
    },
    items: [
      { api_key: "***" },
      { ok: true },
    ],
  });
});

test("parseDurationToMicros supports compound durations and rejects malformed values", () => {
  assert.equal(parseDurationToMicros("1d12h30m45s"), 131_445_000_000);
  assert.throws(() => parseDurationToMicros("10x"), /must look like/);
});

test("resolveTimeRange respects default lookback and max range", () => {
  const endTime = 10_000_000;
  const range = resolveTimeRange({
    endTime,
    defaultLookback: "5s",
    maxRangeMicros: 10_000_000,
    maxRangeLabel: "10s",
  });

  assert.equal(range.startTime, 5_000_000);
  assert.equal(range.endTime, endTime);

  assert.throws(() => resolveTimeRange({
    startTime: 0,
    endTime: 20_000_000,
    defaultLookback: "5s",
    maxRangeMicros: 10_000_000,
    maxRangeLabel: "10s",
  }), /exceeds 10s/);
});
