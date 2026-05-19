# Changelog

## 0.3.2 - 2026-05-19

- Simplified schema guidance to prefer `get_stream_schema` as the single field-discovery path instead of maintaining a separate `get_stream_fields` alias.
- Consolidated trace inspection by removing `get_trace_detail` and adding optional `includeTraceDag` support to `get_trace_summary`.
- Updated server guidance and documentation to steer AI clients toward the new trace-summary flow and broader error-analysis tool set.
- Added regression coverage for `top_errors` aggregation and optional trace DAG inclusion in `get_trace_summary`.

## 0.3.1 - 2026-05-19

- Refined troubleshooting guidance to prefer `list_streams` when the correct log stream is unknown, instead of guessing stream names.
- Added clear candidate-stream selection rules for AI clients: match environment, project, node, path, and naming similarity; try the top 1 to 3 streams first, then expand only if needed.
- Clarified that direct log search should still start immediately when the stream is already known, while `search_sql` remains a bounded fallback for custom queries or full untruncated stack traces.
- Updated Chinese and English documentation to reflect the new stream-selection investigation flow.

## 0.3.0 - 2026-05-08

- Added log analysis tools: `analyze_log_patterns`, `analyze_log_topk`, and `analyze_log_timeline`.
- Added metrics tools: `list_metric_names`, `query_metrics_instant`, and `query_metrics_range`.
- Added alert inspection via `list_alerts`.
- Added zero-dependency `node:test` coverage for client endpoints, log-analysis tools, and utility helpers.
- Added `npm run smoke:live` for real-instance smoke checks and `npm run release:check` for pre-publish validation.
- Expanded Chinese and English documentation with testing, smoke-check, and release guidance.
