import test from "node:test";
import assert from "node:assert/strict";
import { OpenObserveClient } from "../src/openobserve-client.js";

function createClient() {
  return new OpenObserveClient({
    baseUrl: "http://127.0.0.1:5080",
    orgId: "default",
    username: "demo",
    password: "demo",
  });
}

test("queryMetricsInstant uses the Prometheus instant query endpoint", async () => {
  const client = createClient();
  let captured;
  client.request = async (pathname, options) => {
    captured = { pathname, options };
    return { ok: true };
  };

  await client.queryMetricsInstant({
    query: "up",
    time: 123,
  });

  assert.deepEqual(captured, {
    pathname: "/api/default/prometheus/api/v1/query",
    options: {
      query: {
        query: "up",
        time: 123,
      },
    },
  });
});

test("queryMetricsRange uses the Prometheus range query endpoint", async () => {
  const client = createClient();
  let captured;
  client.request = async (pathname, options) => {
    captured = { pathname, options };
    return { ok: true };
  };

  await client.queryMetricsRange({
    query: "rate(http_requests_total[5m])",
    start: 100,
    end: 200,
    step: 60,
  });

  assert.deepEqual(captured, {
    pathname: "/api/default/prometheus/api/v1/query_range",
    options: {
      query: {
        query: "rate(http_requests_total[5m])",
        start: 100,
        end: 200,
        step: 60,
      },
    },
  });
});

test("listMetricNames uses the metric names endpoint", async () => {
  const client = createClient();
  let captured;
  client.request = async (pathname, options) => {
    captured = { pathname, options };
    return { ok: true };
  };

  await client.listMetricNames({
    start: 100,
    end: 200,
    match: '{job="api"}',
  });

  assert.deepEqual(captured, {
    pathname: "/api/default/prometheus/api/v1/label/__name__/values",
    options: {
      query: {
        start: 100,
        end: 200,
        match: '{job="api"}',
      },
    },
  });
});

test("listAlerts uses the alerts endpoint", async () => {
  const client = createClient();
  let captured;
  client.request = async (pathname, options) => {
    captured = { pathname, options };
    return { ok: true };
  };

  await client.listAlerts();

  assert.deepEqual(captured, {
    pathname: "/api/default/alerts",
    options: undefined,
  });
});
