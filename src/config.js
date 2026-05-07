import dotenv from "dotenv";

dotenv.config({ quiet: true });

const DEFAULT_MASK_FIELDS = [
  "password",
  "passwd",
  "pwd",
  "token",
  "secret",
  "authorization",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
];

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`${name} must be an integer`);
  }

  return value;
}

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function loadConfig() {
  const baseUrl = process.env.OPENOBSERVE_BASE_URL;
  const orgId = process.env.OPENOBSERVE_ORG_ID;
  const authToken = process.env.OPENOBSERVE_AUTH_TOKEN;
  const username = process.env.OPENOBSERVE_USERNAME;
  const password = process.env.OPENOBSERVE_PASSWORD;

  if (!baseUrl) {
    throw new Error("Missing OPENOBSERVE_BASE_URL");
  }

  if (!orgId) {
    throw new Error("Missing OPENOBSERVE_ORG_ID");
  }

  if (!authToken && !(username && password)) {
    throw new Error(
      "Provide OPENOBSERVE_AUTH_TOKEN or OPENOBSERVE_USERNAME and OPENOBSERVE_PASSWORD",
    );
  }

  const maskFields = (process.env.OPENOBSERVE_MASK_FIELDS ?? DEFAULT_MASK_FIELDS.join(","))
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    orgId,
    authToken,
    username,
    password,
    defaultLogStream: process.env.OPENOBSERVE_DEFAULT_LOG_STREAM || undefined,
    defaultTraceStream: process.env.OPENOBSERVE_DEFAULT_TRACE_STREAM || undefined,
    maxHours: parseIntEnv("OPENOBSERVE_MAX_HOURS", 24),
    maxLogRows: parseIntEnv("OPENOBSERVE_MAX_LOG_ROWS", 100),
    maxStreamRows: parseIntEnv("OPENOBSERVE_MAX_STREAM_ROWS", 100),
    maskFields,
  };
}
