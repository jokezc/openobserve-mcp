#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerGuidance } from "./guidance.js";
import { OpenObserveClient } from "./openobserve-client.js";
import { registerTools } from "./tools.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const config = loadConfig();
const client = new OpenObserveClient(config);

const server = new McpServer(
  {
    name: "openobserve-mcp",
    version: packageJson.version,
  },
  {
    instructions: [
      "Use these tools for OpenObserve troubleshooting instead of constructing raw API calls.",
      "Prefer small, bounded lookback windows first, then widen only if needed.",
      "If the user already provides a concrete locator such as an error message, request path, node name, project, trace ID, request ID, order ID, log ID, or a precise time hint, prefer direct evidence lookup before schema discovery.",
      "When the user pastes a raw error log, extract the highest-specificity locators first. Prefer short unique IDs, trace IDs, request IDs, order IDs, business IDs, request paths, and precise timestamps over generic framework class names.",
      "If a default log stream is configured, use search_logs first for concrete locators. If the correct stream is unknown, use list_streams to discover the real candidate log streams before searching.",
      "When list_streams returns multiple plausible candidates, choose the most likely 1 to 3 streams first by matching the user's environment, project, node, path, and naming similarity. Expand only if the first candidates do not produce enough evidence.",
      "Do not guess a stream name when list_streams can confirm the real candidates. Do not default to broad cross-stream searching when a smaller set of likely streams can be tried first.",
      "Do not require schema discovery before trying a direct log search for a concrete locator unless field uncertainty blocks the next query.",
      "Use get_stream_schema only when field names or correlation fields are unclear and that uncertainty blocks the next query. Use search_values only after field names are known but valid filter values are still unclear.",
      "When investigating a specific log or business clue, prefer search_logs first and then get_log_context for nearby lines.",
      "After you find a representative error log, use get_log_context immediately to inspect surrounding evidence.",
      "If a trace ID appears in logs or user input, pivot to get_trace_summary and correlate_logs_and_traces. Use get_trace_detail only when the trace summary is insufficient.",
      "If the user reports latency, timeout, or slowness without a concrete error log, prefer find_slow_requests before generic log exploration.",
      "Use top_errors or analyze_log_patterns only for broad scans such as 'what are the main errors recently', not for targeted lookups driven by IDs or exact keywords.",
      "Use search_sql only when the generic tools are not enough or when you need a custom aggregation/query shape.",
      "When investigating metrics, prefer list_metric_names first if the metric name is unclear, then use query_metrics_instant for current values and query_metrics_range for trends.",
      "When investigating alert coverage or rule context, use list_alerts to inspect configured alert definitions.",
      "Do not use generic framework terms such as GlobalExceptionHandler, ExceptionHandler, request error, ERROR, or stacktrace boilerplate as the first search keyword when higher-specificity locators are present in the same log.",
      "Do not start with get_stream_schema for order IDs, request IDs, trace IDs, log IDs, or error keywords. If the stream is unknown, use list_streams first and then try direct log search against candidate log streams.",
      "Do not use search_sql as the default first step. Do not pull broad windows or large row counts before checking a small representative result set.",
      "Do not ask for more rows than needed. Summarize likely causes, affected services, and the strongest supporting evidence.",
    ].join(" "),
  },
);

registerTools(server, client, config);
registerGuidance(server);

const transport = new StdioServerTransport();

await server.connect(transport);
