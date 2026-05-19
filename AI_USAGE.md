# AI Usage Guide

This MCP server is designed for troubleshooting logs and traces in OpenObserve.

## Goal

Help the AI find the most likely root cause quickly, with as few tool calls as possible.

## Recommended Tool Order

### 1. If the data shape is unclear

Use:

- `list_streams`
- `get_stream_settings`
- `get_stream_schema`
- `search_values`
- `search_sql`

Purpose:

- find the right log stream or trace stream
- inspect stream-level query settings, indexed fields, and distinct fields
- identify useful fields such as `service_name`, `level`, `trace_id`, `span_id`, `status_code`
- discover valid field values before filtering
- fall back to `search_sql` only when a custom query shape is needed

### 2. If the user already has a log clue or business clue

Use:

- `search_logs`
- `get_log_context`
- `search_sql`

Purpose:

- pull a small set of recent evidence logs
- inspect surrounding context for one representative event

Suggested flow:

1. run `search_logs` with `service_name`, keyword, order ID, request ID, trace ID, or other structured filters
2. choose the most relevant log line
3. run `get_log_context`
4. if generic filtering is not enough, use `search_sql`

### 3. If broad error aggregation is actually needed

Use:

- `top_errors`
- `search_logs`
- `analyze_log_patterns`
- `analyze_log_topk`
- `search_sql`

Purpose:

- identify dominant error patterns across a time window
- then fetch representative evidence logs

### 4. If the user says "requests are slow" or "trace analysis"

Use:

- `find_slow_requests`
- `get_trace_summary`
- `correlate_logs_and_traces`

Purpose:

- find the slowest traces first
- identify root operations and affected services
- connect a trace back to matching logs

Suggested flow:

1. run `find_slow_requests`
2. choose a suspicious trace
3. run `get_trace_summary`
4. if more detail is needed, rerun `get_trace_summary` with `includeTraceDag=true`
5. run `correlate_logs_and_traces`

### 5. If the user already has a trace ID

Use:

- `get_trace_summary`
- `correlate_logs_and_traces`

Purpose:

- understand the trace shape quickly
- retrieve related logs using `trace_id`, `span_id`, and `service_name`

## Good Defaults

- Start with the default time window unless the user asks for a broader period.
- Prefer a small `limit` such as `10` to `20` for exploration.
- Increase the window only after checking the first result set.

## What The AI Should Return

The AI should not just dump raw rows back to the user.

It should summarize:

- the likely root cause
- the affected service or operation
- the most important evidence
- what is still uncertain
- the next best query if more confirmation is needed

## Tool Roles

- `list_streams`: discover available streams
- `get_stream_settings`: inspect stream metadata, stats, and query-relevant settings
- `get_stream_schema`: understand fields and field hints
- `search_values`: discover valid values for filtering
- `search_logs`: fetch raw log evidence
- `search_sql`: run custom read-only SQL when generic tools are not enough
- `top_errors`: aggregate dominant error messages for broad scans
- `analyze_log_patterns`: normalize and rank dominant recurring log patterns
- `analyze_log_topk`: summarize the most frequent values for a chosen field
- `get_log_context`: inspect nearby lines around one event
- `find_slow_requests`: identify slow traces
- `get_trace_summary`: summarize one trace DAG and optionally include full DAG details
- `correlate_logs_and_traces`: connect trace evidence back to logs

## Preferred Behavior

- Use the smallest sufficient tool first.
- Prefer structured filters over broad keyword-only scans when possible.
- Use schema and value discovery before guessing field names.
- Use stream settings to understand which fields are better suited for filtering.
- Use `search_sql` as a fallback, not as the first tool by default.
- Keep queries bounded and iterative.
