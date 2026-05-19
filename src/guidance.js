import { z } from "zod";

function buildInvestigationPrompt(args) {
  const lines = [
    "You are investigating an OpenObserve alert or troubleshooting request.",
    "Your job is to choose the smallest sufficient tool first, then iteratively narrow the problem.",
    "",
    "Keyword extraction priority from pasted logs:",
    "A. Prefer short unique IDs, trace IDs, request IDs, order IDs, log IDs, business IDs, request paths, and precise timestamps.",
    "B. Use exception class names such as NullPointerException as supporting keywords, not the only keyword, when better locators exist.",
    "C. Avoid generic framework terms such as GlobalExceptionHandler, ExceptionHandler, request error, or ERROR as the first search keyword when more specific locators are present.",
    "",
    "Investigation policy:",
    "1. If the user already provided a concrete locator such as error text, request path, trace ID, request ID, order ID, log ID, node name, or a precise timestamp, start with direct evidence lookup instead of schema discovery.",
    "2. If a default log stream is configured or the correct log stream is already known, use search_logs first for direct evidence lookup.",
    "3. If the correct log stream is unknown, use list_streams first to discover the real candidate streams. Then choose the most likely 1 to 3 candidate streams by matching the user clues such as environment, project, node, path, and naming similarity.",
    "4. If the first candidate streams do not produce enough evidence, expand to the next most likely streams. Do not jump to broad cross-stream searching by default.",
    "5. Do not require get_stream_schema before trying direct log search for a concrete locator unless field uncertainty blocks the next query.",
    "6. Use a short bounded window first. If a precise timestamp is available, center the search around that event. Otherwise start with a short lookback such as 15m to 1h.",
    "7. After finding a representative error log, immediately use get_log_context to inspect surrounding lines.",
    "8. Only use search_values when field names are already known but candidate values are still unclear. Do not guess field names if they are unknown.",
    "9. If a trace ID appears, pivot to get_trace_summary and then correlate_logs_and_traces. Use get_trace_detail only when the summary is insufficient.",
    "10. If the user reports latency, timeout, or slowness without a concrete error log, use find_slow_requests first.",
    "11. Use top_errors or analyze_log_patterns only for broad error distribution, not as the default first step for a specific alert or ID-based lookup.",
    "12. Use search_sql only when the generic tools cannot express the needed filter or aggregation, or when you need an untruncated full stack/message.",
    "",
    "Required output format:",
    "- Conclusion: most likely cause",
    "- Scope: service, node, interface, trace, or dominant error pattern",
    "- Key evidence: the most important logs, context, or trace facts",
    "- Uncertainty: what is still not proven",
    "- Next best query: exactly one next tool call if more confirmation is needed",
    "",
    "User context:",
    `- Environment: ${args.environment ?? "unknown"}`,
    `- Project: ${args.project ?? "unknown"}`,
    `- Node: ${args.node ?? "unknown"}`,
    `- Time hint: ${args.timeHint ?? "unknown"}`,
    `- User request: ${args.request}`,
  ];

  if (args.additionalContext) {
    lines.push(`- Additional context: ${args.additionalContext}`);
  }

  return lines.join("\n");
}

const TRIAGE_GUIDE = `OpenObserve alert triage playbook

Goal
- Find the most likely root cause with the fewest tool calls.
- Prefer bounded evidence gathering over large raw log dumps.

Decision tree
- If the user gives a trace ID:
  Use get_trace_summary, then get_trace_detail if needed, then correlate_logs_and_traces.
- If the user gives a specific error, request path, request ID, order ID, log ID, node name, or precise time:
  Use search_logs first.
- If the user gives a concrete locator but the correct log stream is unknown:
  Use list_streams first, then search_logs against the most likely candidate streams. Choose candidates by matching environment, project, node, and stream naming similarity. Skip schema discovery unless field uncertainty blocks the next query.
- If the stream name, field names, or filter values are unclear:
  Use list_streams, get_stream_settings, get_stream_schema, and search_values only as needed. Do not force schema discovery when direct log search is already possible.
- If the user asks for broad error distribution:
  Use top_errors, then inspect representative rows with search_logs.
- If the user says requests are slow:
  Use find_slow_requests, then get_trace_summary, then correlate_logs_and_traces.

Recommended alert workflow
1. Start with the smallest window that matches the clue density.
2. When the stream is unknown, use list_streams and pick the most likely 1 to 3 candidate streams before expanding further.
3. Prefer structured filters for environment, project, service, node, and level when those fields are known.
4. If you found the target log line, call get_log_context immediately.
5. If the context reveals trace_id or span_id, pivot to trace tools.
6. If the generic tools are insufficient, use search_sql as a bounded fallback.

Examples
- "Help me check why bnz7n9nN failed":
  If the stream is known, first use search_logs with keyword bnz7n9nN in a short recent window, then get_log_context around the representative row. If the stream is unknown, first use list_streams and choose the most likely candidate streams before searching.
- "Application_Stdout [kVA4wr3y] ... GlobalExceptionHandler ... NullPointerException":
  First search by kVA4wr3y, optionally combined with the request path or business ID. If the stream is unknown, first inspect list_streams and choose likely candidates. Do not use GlobalExceptionHandler as the first keyword.
- "Help me check order 20260518001":
  First use search_logs with the order ID in a short bounded window. If the log stream is unknown, use list_streams and then search the top candidate log streams directly. Do not start with schema.
- "management-2 had a NullPointerException at 2026-05-18 18:59":
  First use list_streams to identify candidate streams that match management and the production environment, then use search_logs with the node name, error keyword, and a tight time window around the event.
- "Show the main errors in the last hour":
  First use top_errors, then search_logs for one representative error.

Do not do this
- Do not start with get_stream_schema when the user already gave enough clues for direct log search.
- Do not require schema discovery before searching candidate log streams for an order ID, request ID, trace ID, log ID, or exact keyword.
- Do not start with search_values for an order ID, request ID, trace ID, log ID, or exact keyword.
- Do not use GlobalExceptionHandler, ExceptionHandler, request error, or other framework boilerplate as the first search keyword when a short ID or business locator is present.
- Do not guess a stream name when list_streams can confirm the real candidates.
- Do not scan every stream by default when a smaller set of likely candidates can be chosen first.
- Do not pull a large lookback window first.
- Do not guess trace_id, service_name, or message field names when schema discovery is needed.
- Do not use search_sql as the default first step.`;

export function registerGuidance(server) {
  server.registerPrompt(
    "investigate_alert",
    {
      title: "Investigate Alert",
      description: "Generate a troubleshooting plan for a short alert or error report. Use this when the user only gives a brief clue such as an error keyword, node name, request path, or trace ID.",
      argsSchema: {
        request: z.string().describe("The user's original troubleshooting request or alert text."),
        environment: z.string().optional().describe("Environment name such as prod, staging, or test."),
        project: z.string().optional().describe("Project or service group name if known."),
        node: z.string().optional().describe("Node, pod, or instance name if known."),
        timeHint: z.string().optional().describe("Time hint such as an exact timestamp or a relative time phrase."),
        additionalContext: z.string().optional().describe("Any extra context already known, such as request parameters or a partial stack trace."),
      },
    },
    async (args) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildInvestigationPrompt(args),
            },
          },
        ],
      };
    },
  );

  server.registerResource(
    "alert-triage-guide",
    "openobserve://guides/alert-triage",
    {
      title: "Alert Triage Guide",
      description: "Playbook for choosing the next OpenObserve troubleshooting tool based on how much evidence the user already provided.",
      mimeType: "text/plain",
    },
    async () => {
      return {
        contents: [
          {
            uri: "openobserve://guides/alert-triage",
            text: TRIAGE_GUIDE,
          },
        ],
      };
    },
  );
}
