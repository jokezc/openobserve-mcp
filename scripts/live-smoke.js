import { loadConfig } from "../src/config.js";
import { OpenObserveClient } from "../src/openobserve-client.js";

function printSection(title, payload) {
  console.log(`\n## ${title}`);
  console.log(JSON.stringify(payload, null, 2));
}

async function main() {
  const config = loadConfig();
  const client = new OpenObserveClient(config);

  const streamPayload = await client.listStreams({
    streamType: "logs",
    limit: 5,
    offset: 0,
    sort: "name",
  });
  printSection("Log Streams", {
    total: streamPayload?.total ?? null,
    returned: Array.isArray(streamPayload?.list) ? streamPayload.list.length : 0,
    sample: Array.isArray(streamPayload?.list) ? streamPayload.list.slice(0, 5).map((item) => item?.name) : [],
  });

  if (config.defaultLogStream) {
    const endTime = Date.now() * 1_000;
    const startTime = endTime - (30 * 60 * 1_000_000);
    const searchPayload = await client.search({
      streamType: "logs",
      sql: `SELECT * FROM "${config.defaultLogStream.replaceAll('"', '""')}" ORDER BY _timestamp DESC LIMIT 5`,
      startTime,
      endTime,
      size: 5,
      from: 0,
    });
    printSection("Default Log Stream Search", {
      streamName: config.defaultLogStream,
      total: searchPayload?.total ?? null,
      returned: Array.isArray(searchPayload?.hits) ? searchPayload.hits.length : 0,
      summaryOnly: Array.isArray(searchPayload?.hits)
        ? searchPayload.hits.every((hit) => Object.keys(hit ?? {}).every((key) => key.startsWith("zo_sql_")))
        : false,
    });
  } else {
    console.log("\n## Default Log Stream Search");
    console.log("Skipped because OPENOBSERVE_DEFAULT_LOG_STREAM is not configured.");
  }

  const metricsPayload = await client.listMetricNames({
    start: Math.floor((Date.now() - (60 * 60 * 1000)) / 1000),
    end: Math.floor(Date.now() / 1000),
  });
  printSection("Metric Names", {
    count: Array.isArray(metricsPayload?.data) ? metricsPayload.data.length : 0,
    sample: Array.isArray(metricsPayload?.data) ? metricsPayload.data.slice(0, 10) : [],
  });

  const alertsPayload = await client.listAlerts();
  const alerts = Array.isArray(alertsPayload?.list)
    ? alertsPayload.list
    : (Array.isArray(alertsPayload) ? alertsPayload : []);
  printSection("Alerts", {
    count: alerts.length,
    sample: alerts.slice(0, 5).map((item) => ({
      name: item?.name ?? null,
      stream_name: item?.stream_name ?? null,
      enabled: item?.enabled ?? null,
    })),
  });

  if (config.defaultTraceStream) {
    const endTime = Date.now() * 1_000;
    const startTime = endTime - (60 * 60 * 1_000_000);
    const tracePayload = await client.getLatestTraces({
      streamName: config.defaultTraceStream,
      startTime,
      endTime,
      size: 5,
      from: 0,
      sortBy: "duration",
      sortOrder: "desc",
    });
    printSection("Default Trace Stream", {
      streamName: config.defaultTraceStream,
      total: tracePayload?.total ?? null,
      returned: Array.isArray(tracePayload?.hits) ? tracePayload.hits.length : 0,
    });
  } else {
    console.log("\n## Default Trace Stream");
    console.log("Skipped because OPENOBSERVE_DEFAULT_TRACE_STREAM is not configured.");
  }
}

main().catch((error) => {
  console.error("\nLive smoke check failed.");
  console.error(error?.stack ?? error);
  process.exit(1);
});
