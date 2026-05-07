#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { OpenObserveClient } from "./openobserve-client.js";
import { registerTools } from "./tools.js";

const config = loadConfig();
const client = new OpenObserveClient(config);

const server = new McpServer(
  {
    name: "openobserve-mcp",
    version: "0.1.0",
  },
  {
    instructions: [
      "Use these tools for OpenObserve troubleshooting instead of constructing raw API calls.",
      "Prefer small, bounded lookback windows first, then widen only if needed.",
      "When the stream or fields are unclear, start with list_streams, get_stream_settings, get_stream_schema, and search_values.",
      "When investigating a specific log or business clue, prefer search_logs first and then get_log_context for nearby lines.",
      "Use search_sql only when the generic tools are not enough or when you need a custom aggregation/query shape.",
      "Use top_errors only when you need broad aggregation across a time window.",
      "When investigating traces, prefer find_slow_requests first, then get_trace_summary or get_trace_detail for a single trace, then correlate_logs_and_traces to connect the trace back to log evidence.",
      "Do not ask for more rows than needed. Summarize likely causes, affected services, and the strongest supporting evidence.",
    ].join(" "),
  },
);

registerTools(server, client, config);

const transport = new StdioServerTransport();

await server.connect(transport);
