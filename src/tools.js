import { z } from "zod";
import { maskSensitiveData } from "./sanitize.js";
import { buildContainsClause, buildEqualityClauses, buildWhereClause, quoteIdentifierForFrom } from "./sql.js";
import { formatMicros, resolveTimeRange } from "./time.js";

function renderJson(value) {
  return JSON.stringify(value, null, 2);
}

function textResult(title, data) {
  return {
    content: [
      {
        type: "text",
        text: `${title}\n\n${renderJson(data)}`,
      },
    ],
    structuredContent: data,
  };
}

function clamp(value, max) {
  if (max === undefined || max === null || max <= 0) {
    return Math.max(1, value);
  }

  return Math.max(1, Math.min(value, max));
}

function sanitize(config, value) {
  return maskSensitiveData(value, config.maskFields);
}

function withTimeRange(config, input, defaults) {
  return resolveTimeRange({
    start: input.start,
    end: input.end,
    startTime: input.startTime,
    endTime: input.endTime,
    lookback: input.lookback,
    defaultLookback: defaults.defaultLookback ?? config.defaultLookback,
    maxRangeMicros: config.maxRangeMicros,
    maxRangeLabel: config.maxRangeLabel,
  });
}

function inferMessageField(sampleRow) {
  const candidates = ["message", "log", "body", "msg", "content"];
  return candidates.find((field) => field in sampleRow) ?? null;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildOrClause(parts) {
  const cleaned = parts.filter(Boolean);
  if (cleaned.length === 0) {
    return undefined;
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  return `(${cleaned.join(" OR ")})`;
}

function normalizeSchemaRows(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.list)) {
    return response.list;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (Array.isArray(response?.schema)) {
    return response.schema;
  }

  return [];
}

function summarizeSchemaFields(rows) {
  const normalized = rows
    .map((row) => ({
      name: row.name ?? row.field ?? row.column_name ?? row.column ?? null,
      type: row.type ?? row.data_type ?? row.zo_type ?? row.field_type ?? null,
    }))
    .filter((row) => row.name);

  const fieldsByType = {};
  for (const row of normalized) {
    const type = row.type ?? "unknown";
    if (!fieldsByType[type]) {
      fieldsByType[type] = [];
    }
    fieldsByType[type].push(row.name);
  }

  const importantFieldHints = {
    timestampField: normalized.find((row) => ["_timestamp", "timestamp", "ts"].includes(row.name))?.name ?? null,
    messageField: normalized.find((row) => ["message", "log", "body", "msg", "content"].includes(row.name))?.name ?? null,
    traceIdField: normalized.find((row) => ["trace_id", "traceId", "traceid"].includes(row.name))?.name ?? null,
    spanIdField: normalized.find((row) => ["span_id", "spanId", "spanid"].includes(row.name))?.name ?? null,
    serviceField: normalized.find((row) => ["service_name", "service", "serviceName"].includes(row.name))?.name ?? null,
    levelField: normalized.find((row) => ["level", "severity", "log_level"].includes(row.name))?.name ?? null,
  };

  return {
    fieldCount: normalized.length,
    fieldsByType,
    importantFieldHints,
  };
}

function inferCorrelationFields(rows) {
  const normalized = rows
    .map((row) => row.name ?? row.field ?? row.column_name ?? row.column ?? null)
    .filter(Boolean);

  return {
    traceIdField: normalized.find((name) => ["trace_id", "traceId", "traceid"].includes(name)) ?? null,
    spanIdField: normalized.find((name) => ["span_id", "spanId", "spanid"].includes(name)) ?? null,
    serviceField: normalized.find((name) => ["service_name", "service", "serviceName"].includes(name)) ?? null,
    operationField: normalized.find((name) => ["operation_name", "operation", "span_name"].includes(name)) ?? null,
  };
}

function extractTraceNodes(response) {
  return Array.isArray(response?.nodes) ? response.nodes : [];
}

function isSummaryOnlySearchResult(response) {
  if (!Array.isArray(response?.hits) || response.hits.length === 0) {
    return false;
  }

  return response.hits.every((hit) => {
    const keys = Object.keys(hit ?? {});
    return keys.length > 0 && keys.every((key) => key.startsWith("zo_sql_"));
  });
}

function summarizeSearchResponse(response) {
  return {
    total: response?.total ?? 0,
    hitCount: Array.isArray(response?.hits) ? response.hits.length : 0,
    summaryOnly: isSummaryOnlySearchResult(response),
    traceId: response?.trace_id ?? null,
    took: response?.took ?? null,
    scanRecords: response?.scan_records ?? null,
    scanSize: response?.scan_size ?? null,
  };
}

function buildPagination(limit, offset = 0, total = null) {
  const effectiveTotal = typeof total === "number" ? total : null;
  const nextOffset = effectiveTotal !== null && offset + limit >= effectiveTotal
    ? null
    : offset + limit;

  return {
    limit,
    offset,
    total: effectiveTotal,
    nextOffset,
  };
}

function buildFieldHelpMessage(streamName, streamType = "logs") {
  const target = streamName ? ` for stream "${streamName}"` : "";
  return `The requested field may not exist${target}. Use get_stream_schema first to inspect the available ${streamType} fields, then retry with a valid field name.`;
}

function withFieldGuidance(error, streamName, streamType = "logs") {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();

  if (lowered.includes("field not found") || lowered.includes("search field not found") || lowered.includes("unknown field")) {
    throw new Error(`${message} ${buildFieldHelpMessage(streamName, streamType)}`);
  }

  throw error;
}

function truncateLogMessage(text, maxChars) {
  if (typeof text !== "string" || maxChars === 0 || text.length <= maxChars) {
    return text;
  }

  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}... [truncated ${omitted} chars]`;
}

function isErrorLevelLogRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return false;
  }

  const candidates = [row.level, row.log_level, row.severity, row.severity_text];
  return candidates.some((value) => typeof value === "string" && value.trim().toUpperCase() === "ERROR");
}

function shouldSkipMessageTruncation(row, config) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return false;
  }

  if (isErrorLevelLogRow(row)) {
    return true;
  }

  if (typeof row.message !== "string") {
    return false;
  }

  const keywords = Array.isArray(config.logMessageNoTruncateKeywords)
    ? config.logMessageNoTruncateKeywords
    : [];
  const upperMessage = row.message.toUpperCase();

  return keywords.some((keyword) => keyword && upperMessage.includes(keyword));
}

function formatLogRowPreview(row, config) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return row;
  }

  return {
    ...row,
    message: shouldSkipMessageTruncation(row, config) ? row.message : truncateLogMessage(row.message, config.logMessageCharLimit),
  };
}

function formatLogResponsePreview(response, config) {
  if (!response || typeof response !== "object") {
    return response;
  }

  return {
    ...response,
    hits: Array.isArray(response.hits)
      ? response.hits.map((row) => formatLogRowPreview(row, config))
      : response.hits,
  };
}

function buildSearchResultPayload(config, response, options = {}) {
  const summary = summarizeSearchResponse(response);
  const warning = summary.summaryOnly
    ? "This OpenObserve instance returned summary-only search hits for _search. The count is valid, but raw rows were not returned by the backend."
    : null;
  const sanitized = sanitize(config, response);
  const result = options.logPreview ? formatLogResponsePreview(sanitized, config) : sanitized;

  return {
    summary,
    warning,
    truncation: options.logPreview
      ? {
          messageField: "message",
          messageCharLimit: config.logMessageCharLimit,
        }
      : undefined,
    result,
  };
}

function extractSearchHits(response) {
  return Array.isArray(response?.hits) ? response.hits : [];
}

function buildSelectColumns(columns) {
  return columns.map((column) => quoteIdentifierForFrom(column)).join(", ");
}

function buildLogSearchSql(streamName, input, limit, config) {
  const clauses = [
    input.keyword ? buildContainsClause(input.keywordField, input.keyword) : undefined,
    ...buildEqualityClauses(input.filters),
  ];
  const whereClause = buildWhereClause(clauses);
  const columns = Array.isArray(input.columns) && input.columns.length > 0
    ? input.columns
    : config.defaultLogColumns;

  return `SELECT ${buildSelectColumns(columns)} FROM ${quoteIdentifierForFrom(streamName)}${whereClause} ORDER BY _timestamp DESC LIMIT ${limit}`;
}

async function searchLogRows(client, config, input) {
  const streamName = input.streamName ?? config.defaultLogStream;
  if (!streamName) {
    throw new Error("streamName is required unless OPENOBSERVE_DEFAULT_LOG_STREAM is configured");
  }

  const { startTime, endTime } = withTimeRange(config, input, {});
  const limit = clamp(input.limit ?? config.defaultLogRows, config.maxLogRows);
  const offset = input.offset ?? 0;
  const sql = buildLogSearchSql(streamName, input, limit, config);
  const response = await client.search({
    sql,
    streamType: "logs",
    startTime,
    endTime,
    size: limit,
    from: offset,
  });

  return {
    streamName,
    startTime,
    endTime,
    limit,
    offset,
    sql,
    response,
    rows: extractSearchHits(response),
  };
}

function inferMessageFieldFromRows(rows) {
  for (const row of rows) {
    const field = inferMessageField(row);
    if (field) {
      return field;
    }
  }

  return null;
}

function normalizePatternMessage(message) {
  return String(message)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<IP>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<HEX>")
    .replace(/\b\d+\b/g, "<NUM>")
    .replace(/"[^"]{0,100}"/g, '"<STR>"')
    .trim();
}

function formatBucketStart(bucketStartMicros) {
  return formatMicros(bucketStartMicros)?.slice(0, 16) ?? null;
}

function microsToSeconds(micros) {
  return Math.floor(micros / 1_000_000);
}

function summarizeMetricSeries(response) {
  const series = Array.isArray(response?.data?.result) ? response.data.result : [];
  return {
    status: response?.status ?? null,
    resultType: response?.data?.resultType ?? null,
    seriesCount: series.length,
  };
}

function normalizeAlertList(response) {
  if (Array.isArray(response?.list)) {
    return response.list;
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

function paginateSearchValuesResult(response, offset, limit) {
  if (!response || typeof response !== "object") {
    return {
      result: response,
      pagination: buildPagination(limit, offset, null),
      warning: "The _values response shape was not recognized for pagination; returned the raw payload.",
    };
  }

  if (Array.isArray(response?.hits)) {
    return {
      result: {
        ...response,
        hits: response.hits.slice(offset, offset + limit),
        from: offset,
        size: limit,
      },
      pagination: buildPagination(limit, offset, response?.total ?? null),
      warning: "The _values endpoint is being paginated through its returned hits payload.",
    };
  }

  const paged = Array.isArray(response)
    ? response.slice(offset, offset + limit)
    : Object.fromEntries(
        Object.entries(response).map(([field, values]) => [
          field,
          Array.isArray(values) ? values.slice(offset, offset + limit) : values,
        ]),
      );

  const totalCandidates = Array.isArray(response)
    ? [response.length]
    : Object.values(response)
        .filter(Array.isArray)
        .map((values) => values.length);
  const total = totalCandidates.length > 0 ? Math.max(...totalCandidates) : null;

  return {
    result: paged,
    pagination: buildPagination(limit, offset, total),
    warning: "The _values endpoint does not expose native pagination here, so pagination is applied by slicing the returned value lists in-memory.",
  };
}

function isTraceDagSchemaMismatch(error) {
  return String(error?.message ?? error).includes("llm_observation_type");
}

function summarizeTraceAggregate(hit) {
  const services = Array.isArray(hit?.service_name)
    ? hit.service_name.map((item) => item?.service_name).filter(Boolean)
    : [];

  return {
    source: "traces_latest_fallback",
    serviceCount: services.length,
    services,
    spanCount: Array.isArray(hit?.spans) ? (hit.spans[0] ?? null) : null,
    edgeCount: null,
    durationMicros: hit?.duration ?? null,
    firstEventTimestamp: hit?.first_event?._timestamp ?? null,
    rootOperations: hit?.first_event
      ? [{
          service_name: hit.first_event.service_name ?? null,
          operation_name: hit.first_event.operation_name ?? null,
          span_status: hit.first_event.span_status ?? null,
        }]
      : [],
  };
}

async function getTraceDataWithFallback(client, { streamName, traceId, startTime, endTime }) {
  try {
    const dag = await client.getTraceDag({
      streamName,
      traceId,
      startTime,
      endTime,
    });

    return {
      mode: "dag",
      data: dag,
      warning: null,
    };
  } catch (error) {
    if (!isTraceDagSchemaMismatch(error)) {
      throw error;
    }

    const aggregate = await client.findTraceById({
      streamName,
      traceId,
      startTime,
      endTime,
    });

    return {
      mode: "latest_traces_fallback",
      data: aggregate,
      warning: "Trace DAG endpoint failed on this OpenObserve instance because the backend queried a missing field (llm_observation_type). Returned a trace aggregate from /traces/latest instead.",
    };
  }
}

function normalizeSql(sql) {
  return sql.trim().replace(/;+\s*$/, "");
}

function assertReadOnlySql(sql) {
  const normalized = normalizeSql(sql);
  const lowered = normalized.toLowerCase();

  if (!lowered.startsWith("select ")) {
    throw new Error("Only SELECT queries are allowed");
  }

  const forbiddenPatterns = [
    /\binsert\b/,
    /\bupdate\b/,
    /\bdelete\b/,
    /\bdrop\b/,
    /\balter\b/,
    /\bcreate\b/,
    /\btruncate\b/,
    /\bgrant\b/,
    /\brevoke\b/,
    /\bmerge\b/,
    /\bcall\b/,
  ];

  if (forbiddenPatterns.some((pattern) => pattern.test(lowered))) {
    throw new Error("Only read-only SELECT queries are allowed");
  }

  return normalized;
}

function summarizeStreamSettings(settings = {}) {
  return {
    distinctFields: Array.isArray(settings.distinct_value_fields)
      ? settings.distinct_value_fields.map((field) => field?.name ?? field).filter(Boolean)
      : [],
    fullTextSearchKeys: Array.isArray(settings.full_text_search_keys) ? settings.full_text_search_keys : [],
    indexFields: Array.isArray(settings.index_fields) ? settings.index_fields : [],
    partitionFields: Array.isArray(settings.partition_keys)
      ? settings.partition_keys.map((field) => field?.field).filter(Boolean)
      : [],
    dataRetention: settings.data_retention ?? null,
    maxQueryRange: settings.max_query_range ?? null,
    storeOriginalData: settings.store_original_data ?? null,
    indexAllValues: settings.index_all_values ?? null,
    flattenLevel: settings.flatten_level ?? null,
  };
}

export function registerTools(server, client, config) {
  server.registerTool(
    "search_sql",
    {
      title: "Search SQL",
      description: "Run a bounded read-only SQL query against OpenObserve only when the generic tools are not enough. Do not use this as the default first step for alert investigation when search_logs, get_log_context, schema discovery, or trace tools already fit the problem.",
      inputSchema: {
        sql: z.string().describe("Read-only SELECT SQL query."),
        streamType: z.enum(["logs", "metrics", "traces"]).optional().describe("OpenObserve stream type for the query."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional().describe("Start time in microseconds."),
        endTime: z.number().int().optional().describe("End time in microseconds."),
        limit: z.number().int().positive().optional().describe("Maximum rows requested from OpenObserve for this query."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
      },
    },
    async (input) => {
      const { startTime, endTime } = withTimeRange(config, input, {});
      const sql = assertReadOnlySql(input.sql);
      const limit = clamp(input.limit ?? config.defaultLogRows, config.maxLogRows);
      const offset = input.offset ?? 0;
      const response = await client.search({
        sql,
        streamType: input.streamType ?? "logs",
        startTime,
        endTime,
        size: limit,
        from: offset,
      });

      return textResult("SQL search results", {
        streamType: input.streamType ?? "logs",
        sql,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        ...buildSearchResultPayload(config, response),
      });
    },
  );

  server.registerTool(
    "get_stream_settings",
    {
      title: "Get Stream Settings",
      description: "Fetch a single stream's metadata, query-relevant settings, and stats. Use this after you have identified a candidate stream and need to understand which fields are indexed, searchable, or good filter candidates before querying it.",
      inputSchema: {
        streamName: z.string().describe("Exact stream name."),
        streamType: z.enum(["logs", "metrics", "traces"]).optional(),
      },
    },
    async (input) => {
      const response = await client.getStreamDetails({
        streamName: input.streamName,
        streamType: input.streamType ?? "logs",
      });

      return textResult("Stream settings", {
        streamName: input.streamName,
        streamType: input.streamType ?? "logs",
        summary: {
          totalFields: response?.total_fields ?? null,
          storageType: response?.storage_type ?? null,
          streamType: response?.stream_type ?? input.streamType ?? "logs",
          stats: response?.stats ?? null,
          queryHints: summarizeStreamSettings(response?.settings),
        },
        stream: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "get_stream_schema",
    {
      title: "Get Stream Schema",
      description: "Fetch stream schema and derive hints for fields useful in troubleshooting. Use this only when field names or correlation fields are unclear and that uncertainty blocks the next query. Do not use this as the default first step when the user already provided concrete log clues such as an error message, request path, node name, order ID, request ID, log ID, or timestamp.",
      inputSchema: {
        streamName: z.string().describe("Stream name."),
        streamType: z.enum(["logs", "metrics", "traces"]).optional(),
      },
    },
    async (input) => {
      const response = await client.getStreamSchema({
        streamName: input.streamName,
        streamType: input.streamType ?? "logs",
      });
      const rows = normalizeSchemaRows(response);

      return textResult("Stream schema", {
        streamName: input.streamName,
        streamType: input.streamType ?? "logs",
        summary: summarizeSchemaFields(rows),
        schema: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "search_values",
    {
      title: "Search Values",
      description: "List distinct values for one or more fields in a bounded time range. Use this after schema discovery when field names are known but candidate filter values such as service_name, level, env, namespace, or node are still unclear. Do not use this as the first step for order IDs, request IDs, trace IDs, log IDs, or exact error keywords.",
      inputSchema: {
        streamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        fields: z.array(z.string()).min(1).max(10).describe("Field names to inspect."),
        keyword: z.string().optional().describe("Optional prefix/keyword filter supported by OpenObserve."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        start: z.string().optional().describe("Optional start datetime string such as 2026-05-19 10:09:14."),
        end: z.string().optional().describe("Optional end datetime string such as 2026-05-19 10:19:14."),
        startTime: z.number().int().optional().describe("Optional start time in microseconds. Prefer start when possible."),
        endTime: z.number().int().optional().describe("Optional end time in microseconds. Prefer end when possible."),
        limit: z.number().int().positive().optional().describe("Maximum values per field to return."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
        noCount: z.boolean().optional().describe("When true, skip count calculation if supported by the backend."),
      },
    },
    async (input) => {
      const streamName = input.streamName ?? config.defaultLogStream;
      if (!streamName) {
        throw new Error("streamName is required unless OPENOBSERVE_DEFAULT_LOG_STREAM is configured");
      }

      const { startTime, endTime } = withTimeRange(config, input, {});
      const limit = clamp(input.limit ?? config.defaultLogRows, config.maxLogRows);
      const offset = input.offset ?? 0;
      let response;
      try {
        response = await client.searchValues({
          streamName,
          fields: input.fields,
          startTime,
          endTime,
          size: offset + limit,
          keyword: input.keyword ?? "",
          noCount: input.noCount ?? false,
        });
      } catch (error) {
        withFieldGuidance(error, streamName, "logs");
      }
      const pagedResult = paginateSearchValuesResult(response, offset, limit);

      return textResult("Field values", {
        streamName,
        fields: input.fields,
        range: client.describeRange(startTime, endTime),
        pagination: pagedResult.pagination,
        paginationWarning: pagedResult.warning,
        result: sanitize(config, pagedResult.result),
      });
    },
  );

  server.registerTool(
    "search_logs",
    {
      title: "Search Logs",
      description: "Search logs within a bounded time range using keyword and field filters. This is the default first step when the user already gave concrete clues such as a short unique ID, request path, trace ID, order ID, request ID, log ID, node name, project name, business ID, exception type, or a precise timestamp. When parsing a pasted log, prefer high-specificity locators such as short IDs, business IDs, request paths, and timestamps over generic framework terms like GlobalExceptionHandler. If the correct log stream is unknown, discover candidate log streams first with list_streams and then search those candidate log streams directly instead of requiring schema discovery.",
      inputSchema: {
        streamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        columns: z.array(z.string()).min(1).max(20).optional().describe("Optional columns to select. Defaults to a compact log view with _timestamp and source."),
        keyword: z.string().optional().describe("Keyword to search for. Searches all text fields by default."),
        keywordField: z.string().optional().describe("Optional field name for keyword matching."),
        filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Optional equality filters, for example {\"service_name\":\"api\"}."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        start: z.string().optional().describe("Optional start datetime string such as 2026-05-19 10:09:14."),
        end: z.string().optional().describe("Optional end datetime string such as 2026-05-19 10:19:14."),
        startTime: z.number().int().optional().describe("Optional start time in microseconds. Prefer start when possible."),
        endTime: z.number().int().optional().describe("Optional end time in microseconds. Prefer end when possible."),
        limit: z.number().int().positive().optional().describe("Maximum rows to return."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
      },
    },
    async (input) => {
      let result;
      try {
        result = await searchLogRows(client, config, input);
      } catch (error) {
        withFieldGuidance(error, input.streamName ?? config.defaultLogStream, "logs");
      }
      const { streamName, startTime, endTime, limit, offset, sql, response } = result;

      return textResult("Log search results", {
        streamName,
        sql,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        ...buildSearchResultPayload(config, response, { logPreview: true }),
      });
    },
  );

  server.registerTool(
    "analyze_log_patterns",
    {
      title: "Analyze Log Patterns",
      description: "Normalize log messages and rank the most frequent recurring patterns within a bounded time range. Use this for broad pattern discovery after you already know which log slice you care about, not as the first step for a targeted lookup by ID or exact keyword.",
      inputSchema: {
        streamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        keyword: z.string().optional().describe("Keyword to narrow the log set before pattern analysis."),
        keywordField: z.string().optional().describe("Optional field name for keyword matching."),
        filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Optional equality filters, for example {\"service_name\":\"api\"}."),
        messageField: z.string().optional().describe("Field used as the log message. When omitted, common message fields are inferred from the returned rows."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional().describe("Start time in microseconds."),
        endTime: z.number().int().optional().describe("End time in microseconds."),
        limit: z.number().int().positive().optional().describe("Maximum rows to analyze."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
        top: z.number().int().positive().max(100).optional().describe("Maximum number of normalized patterns to return."),
      },
    },
    async (input) => {
      const { streamName, startTime, endTime, limit, offset, sql, response, rows } = await searchLogRows(client, config, input);
      const summary = summarizeSearchResponse(response);
      const messageField = input.messageField ?? inferMessageFieldFromRows(rows);
      const top = Math.min(input.top ?? 20, 100);
      const counts = new Map();
      let analyzedRows = 0;
      let skippedRows = 0;

      for (const row of rows) {
        const rawMessage = messageField ? row?.[messageField] : undefined;
        if (rawMessage === undefined || rawMessage === null || rawMessage === "") {
          skippedRows += 1;
          continue;
        }

        const normalized = normalizePatternMessage(rawMessage);
        if (!normalized) {
          skippedRows += 1;
          continue;
        }

        analyzedRows += 1;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }

      const patterns = [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, top)
        .map(([pattern, count]) => ({
          pattern,
          count,
          ratio: analyzedRows > 0 ? Number((count / analyzedRows).toFixed(4)) : 0,
        }));

      return textResult("Log pattern analysis", {
        streamName,
        sql,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        warning: summary.summaryOnly
          ? "The backend returned summary-only hits, so no raw log rows were available for pattern analysis."
          : null,
        analysis: {
          messageField,
          analyzedRows,
          skippedRows,
          uniquePatterns: counts.size,
          top,
          patterns,
        },
        sourceSummary: summary,
      });
    },
  );

  server.registerTool(
    "analyze_log_topk",
    {
      title: "Analyze Log TopK",
      description: "Group log rows by a field and return the most frequent values within a bounded time range. Use this to summarize distributions after you already have a relevant log slice, not as the first step for a targeted lookup by ID or exact keyword.",
      inputSchema: {
        streamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        keyword: z.string().optional().describe("Keyword to narrow the log set before aggregation."),
        keywordField: z.string().optional().describe("Optional field name for keyword matching."),
        filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Optional equality filters, for example {\"service_name\":\"api\"}."),
        field: z.string().describe("Field name to group by."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional().describe("Start time in microseconds."),
        endTime: z.number().int().optional().describe("End time in microseconds."),
        limit: z.number().int().positive().optional().describe("Maximum rows to analyze."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
        top: z.number().int().positive().max(100).optional().describe("Maximum number of grouped values to return."),
      },
    },
    async (input) => {
      const { streamName, startTime, endTime, limit, offset, sql, response, rows } = await searchLogRows(client, config, input);
      const summary = summarizeSearchResponse(response);
      const top = Math.min(input.top ?? 20, 100);
      const counts = new Map();
      let missingCount = 0;

      for (const row of rows) {
        const value = row?.[input.field];
        if (value === undefined || value === null || value === "") {
          missingCount += 1;
          continue;
        }

        const normalizedValue = typeof value === "string" ? value : JSON.stringify(value);
        counts.set(normalizedValue, (counts.get(normalizedValue) ?? 0) + 1);
      }

      const groupedValues = [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, top)
        .map(([value, count]) => ({
          value,
          count,
          ratio: rows.length > 0 ? Number((count / rows.length).toFixed(4)) : 0,
        }));

      return textResult("Log TopK analysis", {
        streamName,
        sql,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        warning: summary.summaryOnly
          ? "The backend returned summary-only hits, so no raw log rows were available for TopK analysis."
          : null,
        analysis: {
          field: input.field,
          analyzedRows: rows.length,
          missingCount,
          distinctValueCount: counts.size,
          top,
          values: groupedValues,
        },
        sourceSummary: summary,
      });
    },
  );

  server.registerTool(
    "analyze_log_timeline",
    {
      title: "Analyze Log Timeline",
      description: "Bucket log rows over time to reveal traffic spikes or bursty error windows within a bounded time range. Use this to understand time concentration after you already identified a relevant log slice.",
      inputSchema: {
        streamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        keyword: z.string().optional().describe("Keyword to narrow the log set before timeline analysis."),
        keywordField: z.string().optional().describe("Optional field name for keyword matching."),
        filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Optional equality filters, for example {\"service_name\":\"api\"}."),
        timestampField: z.string().optional().describe("Field used as the event timestamp. Defaults to _timestamp."),
        bucketMinutes: z.number().int().positive().max(1440).optional().describe("Time bucket size in minutes."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional().describe("Start time in microseconds."),
        endTime: z.number().int().optional().describe("End time in microseconds."),
        limit: z.number().int().positive().optional().describe("Maximum rows to analyze."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
      },
    },
    async (input) => {
      const { streamName, startTime, endTime, limit, offset, sql, response, rows } = await searchLogRows(client, config, input);
      const summary = summarizeSearchResponse(response);
      const timestampField = input.timestampField ?? "_timestamp";
      const bucketMinutes = input.bucketMinutes ?? 5;
      const bucketMicros = bucketMinutes * 60 * 1_000_000;
      const counts = new Map();
      let skippedRows = 0;

      for (const row of rows) {
        const rawTimestamp = row?.[timestampField];
        const timestamp = Number(rawTimestamp);
        if (!Number.isFinite(timestamp) || timestamp <= 0) {
          skippedRows += 1;
          continue;
        }

        const bucketStart = Math.floor(timestamp / bucketMicros) * bucketMicros;
        counts.set(bucketStart, (counts.get(bucketStart) ?? 0) + 1);
      }

      const buckets = [...counts.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([bucketStart, count]) => ({
          bucketStart,
          bucketStartIso: formatBucketStart(bucketStart),
          count,
        }));
      const peakBucket = buckets.reduce((peak, bucket) => (!peak || bucket.count > peak.count ? bucket : peak), null);

      return textResult("Log timeline analysis", {
        streamName,
        sql,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        warning: summary.summaryOnly
          ? "The backend returned summary-only hits, so no raw log rows were available for timeline analysis."
          : null,
        analysis: {
          timestampField,
          bucketMinutes,
          analyzedRows: rows.length - skippedRows,
          skippedRows,
          bucketCount: buckets.length,
          peakBucket,
          buckets,
        },
        sourceSummary: summary,
      });
    },
  );

  server.registerTool(
    "top_errors",
    {
      title: "Top Errors",
      description: "Aggregate the most frequent error messages in a log stream over a time range. Use this for broad scans such as 'what are the main errors recently', not as the default first step for a specific alert that already has concrete clues.",
      inputSchema: {
        streamName: z.string().optional(),
        messageField: z.string().optional().describe("Field used as the error message. Defaults to log."),
        serviceField: z.string().optional().describe("Optional field to group by service."),
        serviceName: z.string().optional().describe("Optional service filter."),
        keyword: z.string().optional().describe("Optional keyword to narrow the error set."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
      },
    },
    async (input) => {
      const streamName = input.streamName ?? config.defaultLogStream;
      if (!streamName) {
        throw new Error("streamName is required unless OPENOBSERVE_DEFAULT_LOG_STREAM is configured");
      }

      const { startTime, endTime } = withTimeRange(config, input, {});
      const limit = clamp(input.limit ?? config.defaultLogRows, config.maxLogRows);
      const offset = input.offset ?? 0;
      const messageField = input.messageField ?? "log";
      const filters = input.serviceField && input.serviceName
        ? { [input.serviceField]: input.serviceName }
        : {};

      const whereParts = [
        buildContainsClause(messageField, "error"),
        input.keyword ? buildContainsClause(messageField, input.keyword) : undefined,
        ...buildEqualityClauses(filters),
      ];
      const whereClause = buildWhereClause(whereParts);
      const selectService = input.serviceField
        ? `${quoteIdentifierForFrom(input.serviceField)} AS service_name, `
        : "";
      const groupBy = input.serviceField
        ? `${quoteIdentifierForFrom(input.serviceField)}, ${quoteIdentifierForFrom(messageField)}`
        : `${quoteIdentifierForFrom(messageField)}`;

      const sql = [
        "SELECT",
        `${selectService}${quoteIdentifierForFrom(messageField)} AS error_message, COUNT(*) AS error_count`,
        `FROM ${quoteIdentifierForFrom(streamName)}`,
        whereClause,
        `GROUP BY ${groupBy}`,
        "ORDER BY error_count DESC",
        `LIMIT ${limit}`,
      ].join(" ");

      const response = await client.search({
        sql,
        streamType: "logs",
        startTime,
        endTime,
        size: limit,
        from: offset,
      });

      return textResult("Top errors", {
        streamName,
        sql,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        ...buildSearchResultPayload(config, response, { logPreview: true }),
      });
    },
  );

  server.registerTool(
    "list_streams",
    {
      title: "List Streams",
      description: "List streams by type with optional keyword filtering. Use this when you do not yet know which log or trace stream to investigate, especially to find candidate log streams before direct log search when no default log stream is configured.",
      inputSchema: {
        streamType: z.enum(["logs", "metrics", "traces"]).optional(),
        keyword: z.string().optional(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().positive().optional(),
        sort: z.string().optional().describe("OpenObserve sort field, for example name or stats.doc_num."),
      },
    },
    async (input) => {
      const limit = clamp(input.limit ?? config.defaultStreamRows, config.maxStreamRows);
      const offset = input.offset ?? 0;
      const response = await client.listStreams({
        streamType: input.streamType ?? "logs",
        keyword: input.keyword ?? "",
        offset,
        limit,
        sort: input.sort ?? "name",
      });

      return textResult("Streams", {
        pagination: buildPagination(limit, offset, response?.total ?? null),
        result: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "query_metrics_instant",
    {
      title: "Query Metrics Instant",
      description: "Run an instant PromQL query against OpenObserve's Prometheus-compatible metrics API.",
      inputSchema: {
        query: z.string().describe("PromQL expression to evaluate."),
        lookback: z.string().optional().describe("Relative time range like 30m, 6h, or 1d. Used to derive the evaluation time when startTime/endTime are not supplied."),
        startTime: z.number().int().optional().describe("Start time in microseconds. When endTime is omitted, the query evaluates at this time."),
        endTime: z.number().int().optional().describe("End time in microseconds. When supplied, the query evaluates at this time."),
      },
    },
    async (input) => {
      const { startTime, endTime } = withTimeRange(config, input, { defaultLookback: "15m" });
      const evaluationTime = endTime ?? startTime;
      const response = await client.queryMetricsInstant({
        query: input.query,
        time: microsToSeconds(evaluationTime),
      });

      return textResult("Metrics instant query", {
        query: input.query,
        evaluationTimeMicros: evaluationTime,
        evaluationTimeIso: formatMicros(evaluationTime),
        summary: summarizeMetricSeries(response),
        result: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "query_metrics_range",
    {
      title: "Query Metrics Range",
      description: "Run a range PromQL query over a bounded time window using OpenObserve's Prometheus-compatible metrics API.",
      inputSchema: {
        query: z.string().describe("PromQL expression to evaluate."),
        step: z.number().positive().optional().describe("Range query step in seconds. Defaults to 60."),
        lookback: z.string().optional().describe("Relative time range like 30m, 6h, or 1d12h."),
        startTime: z.number().int().optional().describe("Start time in microseconds."),
        endTime: z.number().int().optional().describe("End time in microseconds."),
      },
    },
    async (input) => {
      const { startTime, endTime } = withTimeRange(config, input, { defaultLookback: "1h" });
      const response = await client.queryMetricsRange({
        query: input.query,
        start: microsToSeconds(startTime),
        end: microsToSeconds(endTime),
        step: input.step ?? 60,
      });

      return textResult("Metrics range query", {
        query: input.query,
        stepSeconds: input.step ?? 60,
        range: client.describeRange(startTime, endTime),
        summary: summarizeMetricSeries(response),
        result: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "list_metric_names",
    {
      title: "List Metric Names",
      description: "List metric names visible in a bounded time range from OpenObserve's Prometheus-compatible metrics API.",
      inputSchema: {
        match: z.string().optional().describe("Optional Prometheus match[] style selector to narrow metric discovery."),
        keyword: z.string().optional().describe("Optional substring filter applied to returned metric names."),
        lookback: z.string().optional().describe("Relative time range like 30m, 6h, or 1d."),
        startTime: z.number().int().optional().describe("Start time in microseconds."),
        endTime: z.number().int().optional().describe("End time in microseconds."),
        limit: z.number().int().positive().optional().describe("Maximum metric names to return."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
      },
    },
    async (input) => {
      const { startTime, endTime } = withTimeRange(config, input, { defaultLookback: "1h" });
      const limit = clamp(input.limit ?? config.defaultStreamRows, config.maxStreamRows);
      const offset = input.offset ?? 0;
      const response = await client.listMetricNames({
        start: microsToSeconds(startTime),
        end: microsToSeconds(endTime),
        match: input.match,
      });
      const names = Array.isArray(response?.data) ? response.data : [];
      const filteredNames = input.keyword
        ? names.filter((name) => String(name).toLowerCase().includes(input.keyword.toLowerCase()))
        : names;
      const pagedNames = filteredNames.slice(offset, offset + limit);

      return textResult("Metric names", {
        range: client.describeRange(startTime, endTime),
        match: input.match ?? null,
        keyword: input.keyword ?? null,
        pagination: buildPagination(limit, offset, filteredNames.length),
        summary: {
          discovered: names.length,
          afterKeywordFilter: filteredNames.length,
          returned: pagedNames.length,
        },
        names: pagedNames,
      });
    },
  );

  server.registerTool(
    "list_alerts",
    {
      title: "List Alerts",
      description: "List alert definitions configured in the current OpenObserve organization. Use this to inspect alert coverage and rule context, not to investigate a specific runtime error unless rule details are part of the question.",
      inputSchema: {},
    },
    async () => {
      const response = await client.listAlerts();
      const alerts = normalizeAlertList(response);

      return textResult("Alerts", {
        summary: {
          count: alerts.length,
        },
        alerts: sanitize(config, alerts),
      });
    },
  );

  server.registerTool(
    "get_log_context",
    {
      title: "Get Log Context",
      description: "Fetch log lines around a known timestamp to inspect surrounding context. Use this immediately after finding a representative error log with search_logs so you can inspect the before-and-after evidence for the same incident.",
      inputSchema: {
        streamName: z.string().optional(),
        timestamp: z.number().int().describe("Target log _timestamp in microseconds."),
        size: z.number().int().positive().optional().describe("Total nearby rows to fetch."),
      },
    },
    async (input) => {
      const streamName = input.streamName ?? config.defaultLogStream;
      if (!streamName) {
        throw new Error("streamName is required unless OPENOBSERVE_DEFAULT_LOG_STREAM is configured");
      }

      const size = clamp(input.size ?? config.defaultLogRows, config.maxLogRows);
      const response = await client.searchAround({
        streamName,
        key: input.timestamp,
        size,
      });

      return textResult("Log context", {
        streamName,
        pivotTimestamp: input.timestamp,
        pivotTimeIso: formatMicros(input.timestamp),
        truncation: {
          messageField: "message",
          messageCharLimit: config.logMessageCharLimit,
        },
        result: formatLogResponsePreview(sanitize(config, response), config),
      });
    },
  );

  server.registerTool(
    "correlate_logs_and_traces",
    {
      title: "Correlate Logs And Traces",
      description: "Given a trace ID, fetch the trace DAG and search for related log lines using trace, span, and service fields. Use this after you already have a trace ID from the user, a log line, or a previous trace query.",
      inputSchema: {
        traceId: z.string().describe("Trace ID to correlate against logs."),
        traceStreamName: z.string().optional().describe("Trace stream name. Defaults to OPENOBSERVE_DEFAULT_TRACE_STREAM when set."),
        logStreamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        logTraceField: z.string().optional().describe("Override the log field that stores trace IDs."),
        logSpanField: z.string().optional().describe("Override the log field that stores span IDs."),
        logServiceField: z.string().optional().describe("Override the log field that stores service names."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
        limit: z.number().int().positive().optional().describe("Maximum related logs to return."),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
      },
    },
    async (input) => {
      const traceStreamName = input.traceStreamName ?? config.defaultTraceStream;
      const logStreamName = input.logStreamName ?? config.defaultLogStream;

      if (!traceStreamName) {
        throw new Error("traceStreamName is required unless OPENOBSERVE_DEFAULT_TRACE_STREAM is configured");
      }
      if (!logStreamName) {
        throw new Error("logStreamName is required unless OPENOBSERVE_DEFAULT_LOG_STREAM is configured");
      }

      const { startTime, endTime } = withTimeRange(config, input, {});
      const traceData = await getTraceDataWithFallback(client, {
        streamName: traceStreamName,
        traceId: input.traceId,
        startTime,
        endTime,
      });
      const trace = traceData.data;

      const logSchema = await client.getStreamSchema({
        streamName: logStreamName,
        streamType: "logs",
      });
      const schemaRows = normalizeSchemaRows(logSchema);
      const inferredFields = inferCorrelationFields(schemaRows);
      const nodes = traceData.mode === "dag" ? extractTraceNodes(trace) : [];
      const spanIds = [...new Set(nodes.map((node) => node.span_id).filter(Boolean))].slice(0, 20);
      const serviceNames = traceData.mode === "dag"
        ? [...new Set(nodes.map((node) => node.service_name).filter(Boolean))].slice(0, 10)
        : (Array.isArray(trace?.service_name)
            ? trace.service_name.map((item) => item?.service_name).filter(Boolean).slice(0, 10)
            : []);

      const logTraceField = input.logTraceField ?? inferredFields.traceIdField;
      const logSpanField = input.logSpanField ?? inferredFields.spanIdField;
      const logServiceField = input.logServiceField ?? inferredFields.serviceField;

      const traceMatchClause = logTraceField
        ? `${quoteIdentifierForFrom(logTraceField)} = ${quoteLiteral(input.traceId)}`
        : undefined;
      const spanMatchClause = logSpanField
        ? buildOrClause(spanIds.map((spanId) => `${quoteIdentifierForFrom(logSpanField)} = ${quoteLiteral(spanId)}`))
        : undefined;
      const serviceMatchClause = logServiceField
        ? buildOrClause(serviceNames.map((serviceName) => `${quoteIdentifierForFrom(logServiceField)} = ${quoteLiteral(serviceName)}`))
        : undefined;

      const correlationClause = buildOrClause([
        traceMatchClause,
        spanMatchClause,
        serviceMatchClause,
      ]);

      if (!correlationClause) {
        throw new Error("Could not infer correlation fields from the log stream schema. Provide logTraceField, logSpanField, or logServiceField.");
      }

      const limit = clamp(input.limit ?? config.defaultLogRows, config.maxLogRows);
      const offset = input.offset ?? 0;
      const sql = `SELECT ${buildSelectColumns(config.defaultLogColumns)} FROM ${quoteIdentifierForFrom(logStreamName)}${buildWhereClause([correlationClause])} ORDER BY _timestamp DESC LIMIT ${limit}`;
      const relatedLogs = await client.search({
        sql,
        streamType: "logs",
        startTime,
        endTime,
        size: limit,
        from: offset,
      });

      const services = traceData.mode === "dag"
        ? [...new Set(nodes.map((node) => node.service_name).filter(Boolean))]
        : serviceNames;
      const rootSpans = traceData.mode === "dag" ? nodes.filter((node) => !node.parent_span_id) : [];

      return textResult("Correlated logs and trace", {
        traceId: input.traceId,
        traceStreamName,
        logStreamName,
        range: client.describeRange(startTime, endTime),
        traceSource: traceData.mode,
        traceWarning: traceData.warning,
        correlation: {
          inferredFields: {
            logTraceField,
            logSpanField,
            logServiceField,
          },
          matchedServices: serviceNames,
          matchedSpanCount: spanIds.length,
        },
        pagination: buildPagination(limit, offset, relatedLogs?.total ?? null),
        traceSummary: traceData.mode === "dag"
          ? {
              source: "dag",
              serviceCount: services.length,
              services,
              spanCount: nodes.length,
              edgeCount: Array.isArray(trace?.edges) ? trace.edges.length : 0,
              rootOperations: rootSpans.map((node) => ({
                service_name: node.service_name,
                operation_name: node.operation_name,
                span_status: node.span_status,
              })),
            }
          : summarizeTraceAggregate(trace),
        relatedLogs: buildSearchResultPayload(config, relatedLogs, { logPreview: true }),
        traceData: sanitize(config, trace),
      });
    },
  );

  server.registerTool(
    "find_slow_requests",
    {
      title: "Find Slow Requests",
      description: "Find traces with the largest duration in a recent time range. Use this when the user reports latency, timeout, or slowness rather than a specific error log.",
      inputSchema: {
        streamName: z.string().optional(),
        filter: z.string().optional().describe("OpenObserve trace filter expression, for example service_name='gateway'."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().min(0).optional().describe("Result offset for pagination."),
      },
    },
    async (input) => {
      const streamName = input.streamName ?? config.defaultTraceStream;
      if (!streamName) {
        throw new Error("streamName is required unless OPENOBSERVE_DEFAULT_TRACE_STREAM is configured");
      }

      const { startTime, endTime } = withTimeRange(config, input, {});
      const limit = clamp(input.limit ?? config.defaultLogRows, config.maxLogRows);
      const offset = input.offset ?? 0;
      const response = await client.getLatestTraces({
        streamName,
        filter: input.filter,
        from: offset,
        startTime,
        endTime,
        size: limit,
        sortBy: "duration",
        sortOrder: "desc",
      });

      return textResult("Slow traces", {
        streamName,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        result: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "get_trace_summary",
    {
      title: "Get Trace Summary",
      description: "Summarize a trace DAG and key services for a single trace ID. Use this as the first trace step when a trace ID is already known or has just been discovered in logs. Set includeTraceDag=true when the full DAG is needed in the same call.",
      inputSchema: {
        streamName: z.string().optional(),
        traceId: z.string(),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
        includeTraceDag: z.boolean().optional().describe("When true, include the full trace DAG/details in the response."),
      },
    },
    async (input) => {
      const streamName = input.streamName ?? config.defaultTraceStream;
      if (!streamName) {
        throw new Error("streamName is required unless OPENOBSERVE_DEFAULT_TRACE_STREAM is configured");
      }

      const { startTime, endTime } = withTimeRange(config, input, {});
      const traceData = await getTraceDataWithFallback(client, {
        streamName,
        traceId: input.traceId,
        startTime,
        endTime,
      });
      const response = traceData.data;

      if (traceData.mode !== "dag") {
        return textResult("Trace summary", {
          traceId: input.traceId,
          streamName,
          range: client.describeRange(startTime, endTime),
          warning: traceData.warning,
          summary: summarizeTraceAggregate(response),
          trace: input.includeTraceDag ? sanitize(config, response) : undefined,
        });
      }

      const nodes = Array.isArray(response?.nodes) ? response.nodes : [];
      const services = [...new Set(nodes.map((node) => node.service_name).filter(Boolean))];
      const rootSpans = nodes.filter((node) => !node.parent_span_id);
      const inferredMessageField = nodes[0] ? inferMessageField(nodes[0]) : null;

      return textResult("Trace summary", {
        traceId: input.traceId,
        streamName,
        range: client.describeRange(startTime, endTime),
        warning: traceData.warning,
        summary: {
          source: "dag",
          serviceCount: services.length,
          services,
          spanCount: nodes.length,
          edgeCount: Array.isArray(response?.edges) ? response.edges.length : 0,
          rootOperations: rootSpans.map((node) => ({
            service_name: node.service_name,
            operation_name: node.operation_name,
            span_status: node.span_status,
          })),
          inferredMessageField,
        },
        traceDag: input.includeTraceDag ? sanitize(config, response) : undefined,
      });
    },
  );
}
