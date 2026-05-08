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

function buildSearchResultPayload(config, response) {
  const summary = summarizeSearchResponse(response);
  const warning = summary.summaryOnly
    ? "This OpenObserve instance returned summary-only search hits for _search. The count is valid, but raw rows were not returned by the backend."
    : null;

  return {
    summary,
    warning,
    result: sanitize(config, response),
  };
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
      description: "Run a bounded read-only SQL query against OpenObserve for cases where generic tools are not enough.",
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
      description: "Fetch a single stream's metadata, query-relevant settings, and stats.",
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
      description: "Fetch stream schema and derive hints for fields that are useful in troubleshooting.",
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
      description: "List distinct values for one or more fields in a bounded time range.",
      inputSchema: {
        streamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        fields: z.array(z.string()).min(1).max(10).describe("Field names to inspect."),
        keyword: z.string().optional().describe("Optional prefix/keyword filter supported by OpenObserve."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
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
      const response = await client.searchValues({
        streamName,
        fields: input.fields,
        startTime,
        endTime,
        size: offset + limit,
        keyword: input.keyword ?? "",
        noCount: input.noCount ?? false,
      });
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
      description: "Search logs within a bounded time range using keyword and field filters.",
      inputSchema: {
        streamName: z.string().optional().describe("Log stream name. Defaults to OPENOBSERVE_DEFAULT_LOG_STREAM when set."),
        keyword: z.string().optional().describe("Keyword to search for. Searches all text fields by default."),
        keywordField: z.string().optional().describe("Optional field name for keyword matching."),
        filters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("Optional equality filters, for example {\"service_name\":\"api\"}."),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional().describe("Start time in microseconds."),
        endTime: z.number().int().optional().describe("End time in microseconds."),
        limit: z.number().int().positive().optional().describe("Maximum rows to return."),
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
      const clauses = [
        input.keyword ? buildContainsClause(input.keywordField, input.keyword) : undefined,
        ...buildEqualityClauses(input.filters),
      ];
      const whereClause = buildWhereClause(clauses);
      const sql = `SELECT * FROM ${quoteIdentifierForFrom(streamName)}${whereClause} ORDER BY _timestamp DESC LIMIT ${limit}`;

      const response = await client.search({
        sql,
        streamType: "logs",
        startTime,
        endTime,
        size: limit,
        from: offset,
      });

      return textResult("Log search results", {
        streamName,
        sql,
        range: client.describeRange(startTime, endTime),
        pagination: buildPagination(limit, offset, response?.total ?? null),
        ...buildSearchResultPayload(config, response),
      });
    },
  );

  server.registerTool(
    "top_errors",
    {
      title: "Top Errors",
      description: "Aggregate the most frequent error messages in a log stream over a time range.",
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
        ...buildSearchResultPayload(config, response),
      });
    },
  );

  server.registerTool(
    "list_streams",
    {
      title: "List Streams",
      description: "List streams by type with optional keyword filtering.",
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
    "get_log_context",
    {
      title: "Get Log Context",
      description: "Fetch log lines around a known timestamp to inspect surrounding context.",
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
        result: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "correlate_logs_and_traces",
    {
      title: "Correlate Logs And Traces",
      description: "Given a trace ID, fetch the trace DAG and search for related log lines using trace, span, and service fields.",
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
      const sql = `SELECT * FROM ${quoteIdentifierForFrom(logStreamName)}${buildWhereClause([correlationClause])} ORDER BY _timestamp DESC LIMIT ${limit}`;
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
        relatedLogs: buildSearchResultPayload(config, relatedLogs),
        traceData: sanitize(config, trace),
      });
    },
  );

  server.registerTool(
    "find_slow_requests",
    {
      title: "Find Slow Requests",
      description: "Find traces with the largest duration in a recent time range.",
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
      description: "Summarize a trace DAG and key services for a single trace ID.",
      inputSchema: {
        streamName: z.string().optional(),
        traceId: z.string(),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
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
          trace: sanitize(config, response),
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
        dag: sanitize(config, response),
      });
    },
  );

  server.registerTool(
    "get_trace_detail",
    {
      title: "Get Trace Detail",
      description: "Fetch the full trace DAG for a single trace ID without reducing it to a summary only.",
      inputSchema: {
        streamName: z.string().optional(),
        traceId: z.string(),
        lookback: z.string().optional().describe("Relative time range like 7d, 12h, 30m, or 1d12h30m."),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
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
        return textResult("Trace detail", {
          traceId: input.traceId,
          streamName,
          range: client.describeRange(startTime, endTime),
          warning: traceData.warning,
          summary: summarizeTraceAggregate(response),
          traceAggregate: sanitize(config, response),
        });
      }

      const nodes = extractTraceNodes(response);
      const services = [...new Set(nodes.map((node) => node.service_name).filter(Boolean))];

      return textResult("Trace detail", {
        traceId: input.traceId,
        streamName,
        range: client.describeRange(startTime, endTime),
        warning: traceData.warning,
        summary: {
          source: "dag",
          spanCount: nodes.length,
          edgeCount: Array.isArray(response?.edges) ? response.edges.length : 0,
          serviceCount: services.length,
          services,
        },
        traceDag: sanitize(config, response),
      });
    },
  );
}
