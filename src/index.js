#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
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
      "When the stream or fields are unclear, start with list_streams, get_stream_settings, get_stream_schema, and search_values.",
      "When investigating a specific log or business clue, prefer search_logs first and then get_log_context for nearby lines.",
      "Use search_sql only when the generic tools are not enough or when you need a custom aggregation/query shape.",
      "When investigating metrics, prefer list_metric_names first if the metric name is unclear, then use query_metrics_instant for current values and query_metrics_range for trends.",
      "When investigating alert coverage or rule context, use list_alerts to inspect configured alert definitions.",
      "Use top_errors only when you need broad aggregation across a time window.",
      "When investigating traces, prefer find_slow_requests first, then get_trace_summary or get_trace_detail for a single trace, then correlate_logs_and_traces to connect the trace back to log evidence.",
      "Do not ask for more rows than needed. Summarize likely causes, affected services, and the strongest supporting evidence.",
    ].join(" "),
  },
);

registerTools(server, client, config);

const transport = new StdioServerTransport();

await server.connect(transport);
