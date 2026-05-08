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
        "OPENOBSERVE_ORG_ID": "default",
        "OPENOBSERVE_USERNAME": "your_username",
        "OPENOBSERVE_PASSWORD": "your_password",
        "OPENOBSERVE_DEFAULT_LOG_STREAM": "app_logs",
        "OPENOBSERVE_DEFAULT_TRACE_STREAM": "default"
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
| `OPENOBSERVE_DEFAULT_TRACE_STREAM` | empty | Default trace stream used by trace-oriented tools |
| `OPENOBSERVE_DEFAULT_LOOKBACK` | `3d` | Default time window for query-oriented tools. Supports values like `7d`, `12h`, `30m`, and `1d12h` |
| `OPENOBSERVE_DEFAULT_LOG_ROWS` | `200` | Default row count used by log-oriented query tools |
| `OPENOBSERVE_DEFAULT_STREAM_ROWS` | `100` | Default row count used by stream listing tools |
| `OPENOBSERVE_MAX_RANGE` | `30d` | Maximum allowed query time range. Supports `7d`, `12h`, `30m`, `1d12h`; use `0` for unlimited |
| `OPENOBSERVE_MAX_LOG_ROWS` | `1000` | Maximum rows returned by log-oriented tools. Use `0` for unlimited |
| `OPENOBSERVE_MAX_STREAM_ROWS` | `500` | Maximum rows returned by stream listing tools. Use `0` for unlimited |
| `OPENOBSERVE_MASK_FIELDS` | built-in field list | Comma-separated field names to mask recursively |

Default query behavior:

- All query-oriented tools use `OPENOBSERVE_DEFAULT_LOOKBACK`, which defaults to `3d`
- Log-oriented tools use `OPENOBSERVE_DEFAULT_LOG_ROWS`, which defaults to `200`
- Stream listing tools use `OPENOBSERVE_DEFAULT_STREAM_ROWS`, which defaults to `100`
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
- `search_sql`
- `top_errors`
- `get_log_context`

### Trace Analysis

- `find_slow_requests`
- `get_trace_summary`
- `get_trace_detail`
- `correlate_logs_and_traces`

## Recommended Investigation Flows

### When stream names or field names are unclear

Recommended order:

1. `list_streams`
2. `get_stream_settings`
3. `get_stream_schema`
4. `search_values`

This helps the model understand the available streams, field layout, and candidate values before guessing filters.

### When you already have a concrete clue

Recommended order:

1. `search_logs`
2. `get_log_context`
3. `search_sql` only if the generic tools are not enough

This is the fastest path for request IDs, order IDs, trace IDs, service names, or known error keywords.

### When the issue is about latency or tracing

Recommended order:

1. `find_slow_requests`
2. `get_trace_summary`
3. `get_trace_detail`
4. `correlate_logs_and_traces`

This flow starts from suspicious traces and narrows down to concrete log evidence.

## Tool Details

Pagination conventions:

- `search_sql`, `search_logs`, `search_values`, `top_errors`, `list_streams`, `find_slow_requests`, and `correlate_logs_and_traces` support `limit` + `offset`
- `get_stream_settings`, `get_stream_schema`, `get_log_context`, `get_trace_summary`, and `get_trace_detail` are detail-oriented tools and do not expose pagination
- `search_values` uses the endpoint's returned shape when possible; if the backend does not expose native pagination, the server slices the returned values and reports that behavior explicitly

### `list_streams`

Best for:

- seeing which log, metric, and trace streams exist in the current organization
- identifying the right stream before starting an investigation
- filtering candidate streams by keyword

### `get_stream_settings`

Best for:

- inspecting stream-level stats and query-related settings
- understanding which fields are suitable for filtering, full-text search, or distinct-value exploration
- learning a stream's query characteristics before searching it

### `get_stream_schema`

Best for:

- checking which fields exist in a log or trace stream
- identifying fields such as `trace_id`, `span_id`, `service_name`, and the main message field
- avoiding guesswork when field names are unclear

### `search_values`

Best for:

- listing recent values for fields like `service_name`, `level`, or `status_code`
- exploring candidate filter values before you know the exact condition
- giving later `search_logs` or `search_sql` queries a safer starting point

### `search_logs`

Best for:

- finding logs by keyword, service name, request ID, order ID, trace ID, or other structured clues
- pulling a small evidence set from a bounded time window
- serving as the first step for most targeted investigations

### `search_sql`

Best for:

- running read-only SQL when the generic tools are not enough
- handling more flexible aggregation, filtering, sorting, and pagination
- acting as a fallback query tool when the generic tools are not enough

Notes:

- only `SELECT` is allowed
- it is better as an advanced fallback than as the default first step

### `top_errors`

Best for:

- aggregating the most frequent errors over a broader time window
- doing a broad scan before drilling into one error family
- identifying which services or message patterns dominate current failures

### `get_log_context`

Best for:

- fetching surrounding log lines around a known `_timestamp`
- understanding what happened immediately before and after a representative event
- reconstructing a local request story from one important log line

### `find_slow_requests`

Best for:

- finding the slowest traces in a recent time range
- serving as the first step when users report latency or slow requests
- identifying suspicious traces before deeper trace inspection

### `get_trace_summary`

Best for:

- quickly understanding the overall shape of a trace from a `traceId`
- summarizing service count, span count, root operations, and impacted services
- making a fast first-pass judgement before loading the full DAG

### `get_trace_detail`

Best for:

- drilling down after `get_trace_summary`
- fetching the full DAG nodes and edges for detailed trace analysis
- allowing the AI client to perform more fine-grained trace reasoning

### `correlate_logs_and_traces`

Best for:

- pulling related logs automatically once a `traceId` is known
- following `trace_id`, `span_id`, and `service_name` together to collect evidence
- narrowing from a suspicious trace to the concrete error logs behind it

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
