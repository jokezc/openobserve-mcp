import test from "node:test";
import assert from "node:assert/strict";
import { registerTools } from "../src/tools.js";

function createHarness(overrides = {}) {
  const tools = new Map();
  const server = {
    registerTool(name, schema, handler) {
      tools.set(name, { schema, handler });
    },
  };

  const client = {
    search: async () => ({ total: 0, hits: [] }),
    describeRange: (startTime, endTime) => `${startTime}->${endTime}`,
    listMetricNames: async () => ({ data: [] }),
    queryMetricsInstant: async () => ({ status: "success", data: { resultType: "vector", result: [] } }),
    queryMetricsRange: async () => ({ status: "success", data: { resultType: "matrix", result: [] } }),
    listAlerts: async () => ({ list: [] }),
    listStreams: async () => ({ list: [] }),
    getStreamDetails: async () => ({}),
    getStreamSchema: async () => ({ schema: [] }),
    searchValues: async () => ({}),
    searchAround: async () => ({}),
    getLatestTraces: async () => ({ hits: [] }),
    getTraceDag: async () => ({ nodes: [], edges: [] }),
    findTraceById: async () => ({}),
    ...overrides.client,
  };

  const config = {
    defaultLogStream: "app_logs",
    defaultTraceStream: "default",
    defaultLogColumns: ["_timestamp", "message"],
    defaultLookback: "1h",
    defaultLogRows: 50,
    defaultStreamRows: 20,
    logMessageCharLimit: 1000,
    maxRangeMicros: 7 * 24 * 60 * 60 * 1_000_000,
    maxRangeLabel: "7d",
    maxLogRows: 500,
    maxStreamRows: 200,
    maskFields: ["password", "token"],
    ...overrides.config,
  };

  registerTools(server, client, config);
  return { tools, client, config };
}

test("analyze_log_patterns normalizes dynamic message fragments", async () => {
  const { tools } = createHarness({
    client: {
      search: async () => ({
        total: 3,
        hits: [
          { _timestamp: 1, log: 'timeout for request_id="abc-123" status=500 ip=10.0.0.1' },
          { _timestamp: 2, log: 'timeout for request_id="def-456" status=502 ip=10.0.0.2' },
          { _timestamp: 3, log: "database unavailable" },
        ],
      }),
    },
  });

  const result = await tools.get("analyze_log_patterns").handler({
    streamName: "app_logs",
    lookback: "30m",
    top: 5,
  });

  assert.equal(result.structuredContent.analysis.analyzedRows, 3);
  assert.equal(result.structuredContent.analysis.uniquePatterns, 2);
  assert.equal(result.structuredContent.analysis.patterns[0].count, 2);
  assert.match(result.structuredContent.analysis.patterns[0].pattern, /timeout/);
  assert.doesNotMatch(result.structuredContent.analysis.patterns[0].pattern, /10\.0\.0\./);
  assert.doesNotMatch(result.structuredContent.analysis.patterns[0].pattern, /500|502/);
});

test("analyze_log_topk groups by the requested field", async () => {
  const { tools } = createHarness({
    client: {
      search: async () => ({
        total: 4,
        hits: [
          { _timestamp: 1, service_name: "api" },
          { _timestamp: 2, service_name: "api" },
          { _timestamp: 3, service_name: "worker" },
          { _timestamp: 4 },
        ],
      }),
    },
  });

  const result = await tools.get("analyze_log_topk").handler({
    field: "service_name",
    lookback: "30m",
  });

  assert.equal(result.structuredContent.analysis.distinctValueCount, 2);
  assert.equal(result.structuredContent.analysis.missingCount, 1);
  assert.deepEqual(result.structuredContent.analysis.values[0], {
    value: "api",
    count: 2,
    ratio: 0.5,
  });
});

test("list_metric_names filters and paginates returned metric names", async () => {
  const { tools } = createHarness({
    client: {
      listMetricNames: async () => ({
        data: ["process_cpu_seconds_total", "http_requests_total", "http_request_duration_seconds"],
      }),
    },
  });

  const result = await tools.get("list_metric_names").handler({
    lookback: "1h",
    keyword: "http",
    limit: 1,
    offset: 1,
  });

  assert.equal(result.structuredContent.summary.discovered, 3);
  assert.equal(result.structuredContent.summary.afterKeywordFilter, 2);
  assert.deepEqual(result.structuredContent.names, ["http_request_duration_seconds"]);
  assert.equal(result.structuredContent.pagination.nextOffset, null);
});

test("query_metrics_instant summarizes vector results", async () => {
  const { tools } = createHarness({
    client: {
      queryMetricsInstant: async ({ query, time }) => ({
        status: "success",
        echo: { query, time },
        data: {
          resultType: "vector",
          result: [
            { metric: { service: "api" }, value: [time, "12"] },
            { metric: { service: "worker" }, value: [time, "3"] },
          ],
        },
      }),
    },
  });

  const result = await tools.get("query_metrics_instant").handler({
    query: "sum(rate(http_requests_total[5m]))",
    lookback: "15m",
  });

  assert.equal(result.structuredContent.summary.seriesCount, 2);
  assert.equal(result.structuredContent.summary.resultType, "vector");
  assert.equal(result.structuredContent.result.status, "success");
});

test("list_alerts normalizes alert list payloads", async () => {
  const { tools } = createHarness({
    client: {
      listAlerts: async () => ({
        list: [
          { name: "High Error Rate", stream_name: "app_logs", enabled: true },
          { name: "Latency Spike", stream_name: "traces", enabled: false },
        ],
      }),
    },
  });

  const result = await tools.get("list_alerts").handler({});

  assert.equal(result.structuredContent.summary.count, 2);
  assert.equal(result.structuredContent.alerts[0].name, "High Error Rate");
  assert.equal(result.structuredContent.alerts[1].enabled, false);
});

test("search_logs truncates oversized log messages in model-facing output", async () => {
  const longMessage = "x".repeat(1200);
  const { tools } = createHarness({
    client: {
      search: async () => ({
        total: 1,
        hits: [
          {
            _timestamp: 1,
            message: longMessage,
            service_name: "management",
          },
        ],
      }),
    },
  });

  const result = await tools.get("search_logs").handler({
    keyword: "NullPointerException",
    lookback: "15m",
    limit: 5,
  });

  const previewMessage = result.structuredContent.result.hits[0].message;
  assert.equal(typeof previewMessage, "string");
  assert.match(previewMessage, /\[truncated 200 chars\]$/);
  assert.ok(previewMessage.length < longMessage.length);
  assert.equal(result.structuredContent.truncation.messageCharLimit, 1000);
});

test("search_logs defaults to compact message-based column selection", async () => {
  let capturedSql = null;
  const { tools } = createHarness({
    client: {
      search: async ({ sql }) => {
        capturedSql = sql;
        return {
          total: 1,
          hits: [{ _timestamp: 1, source: "row-1" }],
        };
      },
    },
  });

  await tools.get("search_logs").handler({
    keyword: "row",
    lookback: "15m",
  });

  assert.match(capturedSql, /SELECT "_timestamp", "message" FROM "app_logs"/);
});

test("search_logs uses caller-provided columns when specified", async () => {
  let capturedSql = null;
  const { tools } = createHarness({
    client: {
      search: async ({ sql }) => {
        capturedSql = sql;
        return {
          total: 1,
          hits: [{ _timestamp: 1, level: "ERROR", message: "row-1" }],
        };
      },
    },
  });

  await tools.get("search_logs").handler({
    keyword: "row",
    lookback: "15m",
    columns: ["_timestamp", "level", "message"],
  });

  assert.match(capturedSql, /SELECT "_timestamp", "level", "message" FROM "app_logs"/);
});

test("correlate_logs_and_traces uses configured default log columns", async () => {
  const searches = [];
  const { tools } = createHarness({
    config: {
      defaultLogColumns: ["_timestamp", "level", "message"],
    },
    client: {
      getTraceDag: async () => ({
        nodes: [
          {
            span_id: "span-1",
            service_name: "management",
            operation_name: "GET /demo",
          },
        ],
        edges: [],
      }),
      getStreamSchema: async () => ({
        schema: [
          { name: "trace_id" },
          { name: "span_id" },
          { name: "service_name" },
        ],
      }),
      search: async ({ sql }) => {
        searches.push(sql);
        return { total: 0, hits: [] };
      },
    },
  });

  await tools.get("correlate_logs_and_traces").handler({
    traceId: "trace-1",
    lookback: "15m",
  });

  assert.match(searches[0], /SELECT "_timestamp", "level", "message" FROM "app_logs"/);
});

test("search_logs does not truncate message when char limit is zero", async () => {
  const longMessage = "x".repeat(1200);
  const { tools } = createHarness({
    config: {
      logMessageCharLimit: 0,
    },
    client: {
      search: async () => ({
        total: 1,
        hits: [
          {
            _timestamp: 1,
            message: longMessage,
          },
        ],
      }),
    },
  });

  const result = await tools.get("search_logs").handler({
    keyword: "x",
    lookback: "15m",
  });

  assert.equal(result.structuredContent.result.hits[0].message, longMessage);
  assert.equal(result.structuredContent.truncation.messageCharLimit, 0);
});

test("search_logs adds schema guidance when a filter field is missing", async () => {
  const { tools } = createHarness({
    client: {
      search: async () => {
        throw new Error("Search field not found: node_name");
      },
    },
  });

  await assert.rejects(
    () => tools.get("search_logs").handler({
      streamName: "prod_management",
      filters: { node_name: "management-2" },
      lookback: "15m",
    }),
    /Use get_stream_schema or get_stream_fields first to inspect the available logs fields/,
  );
});

test("search_values adds schema guidance when a field is missing", async () => {
  const { tools } = createHarness({
    client: {
      searchValues: async () => {
        throw new Error("Search field not found: node_name");
      },
    },
  });

  await assert.rejects(
    () => tools.get("search_values").handler({
      streamName: "prod_management",
      fields: ["node_name"],
      lookback: "15m",
    }),
    /Use get_stream_schema or get_stream_fields first to inspect the available logs fields/,
  );
});

test("get_stream_fields exposes a direct alias for schema discovery", async () => {
  const { tools } = createHarness({
    client: {
      getStreamSchema: async () => ({
        schema: [
          { name: "_timestamp", type: "Utf8" },
          { name: "message", type: "Utf8" },
        ],
      }),
    },
  });

  const result = await tools.get("get_stream_fields").handler({
    streamName: "prod_management",
  });

  assert.equal(result.structuredContent.streamName, "prod_management");
  assert.equal(result.structuredContent.summary.fieldCount, 2);
  assert.equal(result.structuredContent.fields.schema[0].name, "_timestamp");
});

test("search_logs accepts readable start and end datetime strings", async () => {
  let capturedRange = null;
  const { tools } = createHarness({
    client: {
      search: async ({ startTime, endTime }) => {
        capturedRange = { startTime, endTime };
        return {
          total: 0,
          hits: [],
        };
      },
    },
  });

  await tools.get("search_logs").handler({
    streamName: "prod_management",
    start: "2026-05-19 10:09:14",
    end: "2026-05-19 10:19:14",
    keyword: "k4szB4jM",
  });

  assert.equal(capturedRange.startTime, 1779156554000000);
  assert.equal(capturedRange.endTime, 1779157154000000);
});
