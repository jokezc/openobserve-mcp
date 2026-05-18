import { formatMicros } from "./time.js";

function buildAuthorizationHeader(config) {
  const token = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return `Basic ${token}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class OpenObserveClient {
  constructor(config) {
    this.config = config;
    this.authorization = buildAuthorizationHeader(config);
  }

  async request(pathname, { method = "GET", query, body } = {}) {
    const url = new URL(`${this.config.baseUrl}${pathname}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: this.authorization,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = await parseJsonResponse(response);
    if (!response.ok) {
      const details = typeof payload === "string" ? payload : JSON.stringify(payload);
      throw new Error(`OpenObserve request failed (${response.status} ${response.statusText}): ${details}`);
    }

    return payload;
  }

  async search({
    streamType = "logs",
    sql,
    startTime,
    endTime,
    size,
    from = 0,
  }) {
    return this.request(`/api/${this.config.orgId}/_search`, {
      method: "POST",
      query: {
        type: streamType,
      },
      body: {
        query: {
          sql,
          start_time: startTime,
          end_time: endTime,
          from,
          size,
        },
      },
    });
  }

  async searchAround({ streamName, key, size }) {
    return this.request(`/api/${this.config.orgId}/${encodeURIComponent(streamName)}/_around`, {
      method: "GET",
      query: {
        type: "logs",
        key,
        size,
      },
    });
  }

  async listStreams({ streamType = "logs", keyword = "", offset = 0, limit = 20, sort = "name" }) {
    return this.request(`/api/${this.config.orgId}/streams`, {
      query: {
        type: streamType,
        keyword,
        offset,
        limit,
        sort,
      },
    });
  }

  async getStreamDetails({ streamName, streamType = "logs" }) {
    const response = await this.listStreams({
      streamType,
      keyword: streamName,
      offset: 0,
      limit: 100,
      sort: "name",
    });

    const list = Array.isArray(response?.list) ? response.list : [];
    const exactMatch = list.find((item) => item?.name === streamName);
    if (!exactMatch) {
      throw new Error(`Stream not found: ${streamName} (${streamType})`);
    }

    return exactMatch;
  }

  async getStreamSchema({ streamName, streamType = "logs" }) {
    return this.request(
      `/api/${this.config.orgId}/streams/${encodeURIComponent(streamName)}/schema`,
      {
        query: {
          type: streamType,
        },
      },
    );
  }

  async searchValues({
    streamName,
    fields,
    startTime,
    endTime,
    size = 10,
    keyword = "",
    noCount = false,
  }) {
    return this.request(`/api/${this.config.orgId}/${encodeURIComponent(streamName)}/_values`, {
      query: {
        fields: Array.isArray(fields) ? fields.join(",") : fields,
        start_time: startTime,
        end_time: endTime,
        size,
        keyword,
        no_count: noCount,
      },
    });
  }

  async getLatestTraces({
    streamName,
    filter,
    from = 0,
    size = 20,
    startTime,
    endTime,
    sortBy = "start_time",
    sortOrder = "desc",
  }) {
    return this.request(`/api/${this.config.orgId}/${encodeURIComponent(streamName)}/traces/latest`, {
      query: {
        filter,
        from,
        size,
        start_time: startTime,
        end_time: endTime,
        sort_by: sortBy,
        sort_order: sortOrder,
      },
    });
  }

  async findTraceById({ streamName, traceId, startTime, endTime }) {
    const response = await this.getLatestTraces({
      streamName,
      filter: `trace_id = '${String(traceId).replaceAll("'", "''")}'`,
      startTime,
      endTime,
      size: 1,
      sortBy: "duration",
      sortOrder: "desc",
    });

    const hit = Array.isArray(response?.hits) ? response.hits[0] : undefined;
    if (!hit) {
      throw new Error(`Trace not found: ${traceId} (${streamName})`);
    }

    return hit;
  }

  async getTraceDag({ streamName, traceId, startTime, endTime }) {
    return this.request(
      `/api/${this.config.orgId}/${encodeURIComponent(streamName)}/traces/${encodeURIComponent(traceId)}/dag`,
      {
        query: {
          start_time: startTime,
          end_time: endTime,
        },
      },
    );
  }

  async queryMetricsInstant({ query, time }) {
    return this.request(`/api/${this.config.orgId}/prometheus/api/v1/query`, {
      query: {
        query,
        time,
      },
    });
  }

  async queryMetricsRange({ query, start, end, step }) {
    return this.request(`/api/${this.config.orgId}/prometheus/api/v1/query_range`, {
      query: {
        query,
        start,
        end,
        step,
      },
    });
  }

  async listMetricNames({ start, end, match }) {
    return this.request(`/api/${this.config.orgId}/prometheus/api/v1/label/__name__/values`, {
      query: {
        start,
        end,
        match,
      },
    });
  }

  async listAlerts() {
    return this.request(`/api/${this.config.orgId}/alerts`);
  }

  describeRange(startTime, endTime) {
    return `${formatMicros(startTime)} -> ${formatMicros(endTime)}`;
  }
}
