# OpenObserve MCP

[简体中文](./README.md)

`OpenObserve MCP` is a local `stdio` MCP server built for OpenObserve troubleshooting workflows.

This project packages common OpenObserve workflows for log search, field discovery, error aggregation, trace analysis, and log-trace correlation into a bounded set of MCP tools so AI clients can investigate incidents more reliably.

## What It Helps With

- Explore available log and trace streams
- Inspect stream schema, settings, and query hints
- Search logs within bounded time ranges
- Discover candidate field values before filtering
- Aggregate frequent error patterns
- Query current metric values and time-series trends
- Inspect alert definitions in the current organization
- Find slow requests and inspect trace DAGs
- Correlate traces back to related logs
- Recursively mask common sensitive fields

## MCP Client Setup

### Use via npm / npx

After publishing, the package can be used directly with `npx`:

```json
{
  "mcpServers": {
    "openobserve": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@jokezc/openobserve-mcp"
      ],
      "env": {
        "OPENOBSERVE_BASE_URL": "http://127.0.0.1:5080",
        "OPENOBSERVE_USERNAME": "your_username",
        "OPENOBSERVE_PASSWORD": "your_password"
      }
    }
  }
}
```

### Use from a local clone

You can also point your MCP client to the local repository:

```json
{
  "mcpServers": {
    "openobserve": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:\\sourceCode\\nodejs\\openobserve-mcp\\src\\index.js"
      ],
      "cwd": "C:\\sourceCode\\nodejs\\openobserve-mcp",
      "env": {
        "OPENOBSERVE_BASE_URL": "http://127.0.0.1:5080",
        "OPENOBSERVE_ORG_ID": "default",
        "OPENOBSERVE_USERNAME": "your_username",
        "OPENOBSERVE_PASSWORD": "your_password"
      }
    }
  }
}
```

This setup works well for Cherry Studio and other MCP clients that support `stdio`.

## Requirements

- Node.js `18+`
- A reachable OpenObserve instance
- Use `OPENOBSERVE_USERNAME` + `OPENOBSERVE_PASSWORD`

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Create a local environment file

```bash
cp .env.example .env
```

In PowerShell you can also run:

```powershell
Copy-Item .env.example .env
```

3. Fill in `.env`

```env
OPENOBSERVE_BASE_URL=http://your-openobserve:5080
OPENOBSERVE_ORG_ID=default
OPENOBSERVE_USERNAME=your_username
OPENOBSERVE_PASSWORD=your_password
```

4. Start the MCP server

```bash
npm start
```

The process will then wait for an MCP client connection over `stdio`.

5. Run tests

```bash
npm test
```

6. Run a live smoke check when you have a real OpenObserve instance

```bash
npm run smoke:live
```

## Configuration

### Base Configuration

| Variable | Description |
| --- | --- |
| `OPENOBSERVE_BASE_URL` | OpenObserve base URL, for example `http://127.0.0.1:5080` |
| `OPENOBSERVE_ORG_ID` | OpenObserve organization ID. Defaults to `default` |
| `OPENOBSERVE_USERNAME` | Basic auth username |
| `OPENOBSERVE_PASSWORD` | Basic auth password |

### Optional

| Variable | Default | Description |
| --- | --- | --- |
| `OPENOBSERVE_DEFAULT_LOG_STREAM` | empty | Default log stream used by log-oriented tools |
| `OPENOBSERVE_DEFAULT_TRACE_STREAM` | `default` | Default trace stream used by trace-oriented tools |
| `OPENOBSERVE_DEFAULT_LOG_COLUMNS` | `_timestamp,message` | Comma-separated default columns used by `search_logs` and log-correlation tools |
| `OPENOBSERVE_DEFAULT_LOOKBACK` | `3d` | Default time window for query-oriented tools. Supports values like `7d`, `12h`, `30m`, and `1d12h` |
| `OPENOBSERVE_DEFAULT_LOG_ROWS` | `50` | Default row count used by log-oriented query tools |
| `OPENOBSERVE_DEFAULT_STREAM_ROWS` | `100` | Default row count used by stream listing tools |
| `OPENOBSERVE_LOG_MESSAGE_CHAR_LIMIT` | `2000` | Default truncation length for the log `message` field. Use `0` for unlimited |
| `OPENOBSERVE_LOG_NO_TRUNCATE_KEYWORDS` | `ERROR,WARN` | Comma-separated keywords that disable truncation when found in `message`, case-insensitive; leading and trailing spaces are preserved |
| `OPENOBSERVE_MAX_RANGE` | `31d` | Maximum allowed query span. Supports `7d`, `12h`, `30m`, `1d12h`; use `0` for unlimited. This limits the distance between start and end, not how far back in history the range begins |
| `OPENOBSERVE_MAX_LOG_ROWS` | `1000` | Maximum rows returned by log-oriented tools. Use `0` for unlimited |
| `OPENOBSERVE_MAX_STREAM_ROWS` | `500` | Maximum rows returned by stream listing tools. Use `0` for unlimited |
| `OPENOBSERVE_MASK_FIELDS` | built-in field list | Comma-separated field names to mask recursively |

If you plan to run `npm run smoke:live`, it is helpful to also configure:

- `OPENOBSERVE_DEFAULT_LOG_STREAM`
- `OPENOBSERVE_DEFAULT_TRACE_STREAM`

Default query behavior:

- All query-oriented tools use `OPENOBSERVE_DEFAULT_LOOKBACK`, which defaults to `3d`
- Log-oriented tools use `OPENOBSERVE_DEFAULT_LOG_ROWS`, which defaults to `50`
- Stream listing tools use `OPENOBSERVE_DEFAULT_STREAM_ROWS`, which defaults to `100`
- `OPENOBSERVE_DEFAULT_LOG_STREAM` is empty by default, so the server will not guess a log stream name for you
- `OPENOBSERVE_DEFAULT_TRACE_STREAM` defaults to `default`
- `search_logs` uses `OPENOBSERVE_DEFAULT_LOG_COLUMNS` by default, which defaults to `_timestamp,message`
- Log body handling defaults to the `message` field, and truncation is controlled by `OPENOBSERVE_LOG_MESSAGE_CHAR_LIMIT`, which defaults to `2000`; use `0` for unlimited. Rows with log level `ERROR`, or whose `message` contains any `OPENOBSERVE_LOG_NO_TRUNCATE_KEYWORDS` entry, are not truncated. Entries keep their surrounding spaces, so values like ` ERROR , WARN ` can be used to better match log-level boundaries
- Query tools consistently support `lookback` values like `30m`, `6h`, `7d`, and `1d12h`
- All queries are still constrained by `OPENOBSERVE_MAX_RANGE`, `OPENOBSERVE_MAX_LOG_ROWS`, and `OPENOBSERVE_MAX_STREAM_ROWS`

## Included Tools

### Discovery

- `list_streams`
- `get_stream_settings`
- `get_stream_schema`
- `search_values`

### Log Investigation

- `search_logs`
- `analyze_log_patterns`
- `analyze_log_topk`
- `analyze_log_timeline`
- `search_sql`
- `top_errors`
- `get_log_context`

### Metrics Analysis

- `list_metric_names`
- `query_metrics_instant`
- `query_metrics_range`

### Alert Inspection

- `list_alerts`

### Trace Analysis

- `find_slow_requests`
- `get_trace_summary`
- `correlate_logs_and_traces`

## Recommended Investigation Flows

### When stream names or field names are unclear

Recommended order:

1. `list_streams`
2. Choose the most likely `1` to `3` candidate streams from the returned list
3. `search_logs`
4. Use `get_stream_settings` and `get_stream_schema` only if field uncertainty still blocks the next query
5. Use `search_values` only when field names are known but candidate values are still unclear

Prefer candidate streams that best match the user's environment, project, node, request path, and naming similarity. Start with the smallest likely set before expanding to more streams.

### When you already have a concrete clue

Recommended order:

1. If the stream is known, use `search_logs` directly
2. If the stream is unknown, use `list_streams` first and then run `search_logs` against the most likely `1` to `3` candidate streams
3. `get_log_context`
4. `search_sql` only if the generic tools are not enough

This is the fastest path for request IDs, order IDs, trace IDs, service names, node names, request paths, or known error keywords. Prefer high-specificity clues such as short unique IDs, exact paths, and precise timestamps over generic exception terms.

### When you need conclusions from a batch of logs

Recommended order:

1. `search_logs`
2. `analyze_log_patterns`
3. `analyze_log_topk`
4. `analyze_log_timeline`

This flow is useful for questions like "what are the main error families", "which service appears most often", or "when did the spike happen".

### When the issue is about latency or tracing

Recommended order:

1. `find_slow_requests`
2. `get_trace_summary`
3. `correlate_logs_and_traces`

This flow starts from suspicious traces and narrows down to concrete log evidence. When the full DAG is needed, set `includeTraceDag=true` on `get_trace_summary`.

### When you need current metric values or trends

Recommended order:

1. Use `list_metric_names` first if the metric name is unclear
2. Use `query_metrics_instant` for current values
3. Use `query_metrics_range` for recent trends

This flow is useful for CPU, memory, QPS, latency, or error-rate questions.

### When you need alert coverage or rule context

Recommended order:

1. `list_alerts`

This is useful for checking whether a stream, service, or failure mode already has alert coverage.

## Tool Details

Pagination conventions:

- `search_sql`, `search_logs`, `search_values`, `top_errors`, `list_streams`, `find_slow_requests`, `correlate_logs_and_traces`, and `list_metric_names` support `limit` + `offset`
- `get_stream_settings`, `get_stream_schema`, `get_log_context`, `get_trace_summary`, `query_metrics_instant`, `query_metrics_range`, and `list_alerts` are detail-oriented tools and do not expose pagination
- `search_values` uses the endpoint's returned shape when possible; if the backend does not expose native pagination, the server slices the returned values and reports that behavior explicitly

### Discovery Tools

#### `list_streams`

- What it does: lists the available log, metric, and trace streams and answers "which stream should I inspect first?"
- Best for: finding candidate log streams, filtering by keyword, and confirming the investigation entry point
- Boundary: it does not explain field structure or return actual log evidence

#### `get_stream_settings`

- What it does: returns stream-level stats, indexing hints, full-text-search settings, and query-relevant metadata
- Best for: understanding which fields are good filter candidates or indexing/search candidates
- Boundary: it is stream-configuration oriented; `get_stream_schema` is field-structure oriented

#### `get_stream_schema`

- What it does: returns the fields, types, and schema summary for a stream
- Best for: verifying field names before filtering and locating key fields such as `trace_id`, `span_id`, `service_name`, and the main message field
- Boundary: it answers "which fields exist?"; `search_values` answers "which values exist?"

#### `search_values`

- What it does: shows recent values for one or more known fields
- Best for: discovering candidate values for fields like `service_name`, `level`, `namespace`, or `status_code`
- Boundary: for direct evidence lookup by ID, trace ID, request ID, or exact keyword, use `search_logs`

### Log Investigation Tools

#### `search_logs`

- What it does: searches raw logs using keywords, fields, and bounded time ranges
- Best for: direct evidence lookup by request ID, order ID, trace ID, service name, node, path, or error text
- Time hint: prefer short windows first; use `start` / `end` when you already know the exact time range
- Boundary: it is raw evidence lookup, not pattern analysis, TopK analysis, or timeline analysis

#### `get_log_context`

- What it does: fetches surrounding log lines around a known `_timestamp`
- Best for: understanding what happened immediately before and after a representative log event
- Boundary: you typically use it after `search_logs`, not instead of `search_logs`

#### `top_errors`

- What it does: aggregates the most frequent recent error messages
- Best for: answering "what are the main errors recently" and doing a fast broad error scan
- Boundary: it is a fixed shortcut aggregation; `analyze_log_patterns` is message-pattern-oriented and `analyze_log_topk` is field-oriented

#### `analyze_log_patterns`

- What it does: normalizes log messages and groups recurring message patterns
- Best for: identifying the main error shapes in a recent log slice, especially when messages contain dynamic values
- Boundary: it is message-pattern-oriented, not field-oriented and not raw-evidence lookup

#### `analyze_log_topk`

- What it does: ranks the most frequent values of a chosen field
- Best for: seeing which service, namespace, level, or status code dominates a log slice
- Boundary: it is field-distribution-oriented, not message-pattern-oriented or time-distribution-oriented

#### `analyze_log_timeline`

- What it does: buckets a log slice over time to show spikes and burst windows
- Best for: identifying when an anomaly concentrated and aligning a log spike with a trace or metric event window
- Boundary: it is time-distribution-oriented, not field-distribution-oriented or message-clustering-oriented

#### `search_sql`

- What it does: runs bounded read-only SQL when the generic tools are not enough
- Best for: custom aggregations, filters, sorting, and pagination that do not fit the higher-level tools cleanly
- Constraint: only `SELECT` is allowed, and it is best treated as an advanced fallback

### Metrics Tools

#### `list_metric_names`

- What it does: discovers metric names visible in a recent time window
- Best for: finding candidate metric names before writing PromQL

#### `query_metrics_instant`

- What it does: evaluates a PromQL expression at one point in time
- Best for: checking current values and validating whether a metric is abnormal right now

#### `query_metrics_range`

- What it does: evaluates a PromQL expression over a time range
- Best for: reviewing trends, spikes, fluctuations, and peaks, and aligning a metric anomaly with logs or traces
- Boundary: `query_metrics_instant` is for a single evaluation point; this one is for a time series

### Alert Inspection Tools

#### `list_alerts`

- What it does: lists the alert definitions configured in the current organization
- Best for: checking whether a stream, service, or scenario already has alert coverage

### Trace Tools

#### `find_slow_requests`

- What it does: finds the slowest traces in a recent time range
- Best for: user reports about slowness, latency, or timeouts
- Boundary: it finds suspicious traces first; `get_trace_summary` inspects a known trace ID

#### `get_trace_summary`

- What it does: summarizes one trace by `traceId` and can optionally include the full DAG with `includeTraceDag=true`
- Best for: first-pass trace understanding, including service count, span count, root operations, and impacted services
- Boundary: there is no separate `get_trace_detail` anymore; use `includeTraceDag=true` when you need full DAG detail

#### `correlate_logs_and_traces`

- What it does: takes a known `traceId`, fetches trace context, and searches related logs
- Best for: bridging trace evidence back to concrete logs and following `trace_id`, `span_id`, and `service_name` together
- Boundary: `get_trace_summary` focuses on the trace itself; this tool focuses on trace-log correlation

## Design Principles

- Bounded by default: all query tools use time windows and max-range limits
- Safer exploration: row counts are capped to avoid dumping too many raw logs
- AI-friendly defaults: tools are grouped into discovery, log investigation, and trace investigation workflows
- Correlation-first workflow: traces and logs are meant to be investigated together
- Sensitive data protection: common secret-like fields are redacted recursively

## Repository Reference Docs

The repository also includes reference materials that are useful when extending the MCP server:

- [AI_USAGE.md](./AI_USAGE.md): concise usage guidance for AI / MCP clients
- [AI_SYSTEM_PROMPT.zh-CN.md](./AI_SYSTEM_PROMPT.zh-CN.md): Chinese troubleshooting system prompt template
- `openapi.json`: local OpenObserve OpenAPI reference

## Local Development

Run normally:

```bash
npm start
```

Run tests:

```bash
npm test
```

Run the live smoke check:

```bash
npm run smoke:live
```

Run in watch mode:

```bash
npm run dev
```

Current source layout:

- `src/index.js`: MCP server entry
- `src/config.js`: environment parsing and safety limits
- `src/openobserve-client.js`: OpenObserve API wrapper
- `src/tools.js`: MCP tool definitions
- `src/sql.js`: SQL helper utilities
- `src/time.js`: time-range utilities
- `src/sanitize.js`: recursive masking logic

## Publishing

Recommended pre-release order:

1. `npm test`
2. `npm run smoke:live`
3. `npm run release:check`
4. Confirm that `README`, `.env.example`, and `CHANGELOG.md` are up to date

The package is configured for public scoped publishing:

```bash
npm login
npm publish --access public
```

Published package name:

- `@jokezc/openobserve-mcp`

The current version supports username/password auth only and no longer supports `OPENOBSERVE_AUTH_TOKEN`.

## Contributing

Issues and pull requests are welcome.

If you want to add tools, improve prompts, strengthen safety boundaries, or refine docs, see [CONTRIBUTING.en.md](./CONTRIBUTING.en.md).

## License

MIT. See [LICENSE](./LICENSE).
