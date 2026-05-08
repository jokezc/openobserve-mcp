import dotenv from "dotenv";
import { parseDurationToMicros } from "./time.js";

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

function parseNonNegativeIntEnv(name, fallback) {
  const value = parseIntEnv(name, fallback);
  if (value < 0) {
    throw new Error(`${name} must be greater than or equal to 0`);
  }

  return value;
}

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function parseMaxRangeConfig() {
  const durationLike = process.env.OPENOBSERVE_MAX_RANGE ?? "7d";
  if (durationLike !== undefined && durationLike !== "") {
    const normalized = durationLike.trim().toLowerCase();
    if (normalized === "0") {
      return { maxRangeMicros: 0, maxRangeLabel: "0 (unlimited)" };
    }

    return {
      maxRangeMicros: parseDurationToMicros(durationLike, "OPENOBSERVE_MAX_RANGE"),
      maxRangeLabel: durationLike,
    };
  }
}

function parseDurationEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  if (raw.trim() === "0") {
    throw new Error(`${name} must be a positive duration like 30m, 6h, or 3d`);
  }

  parseDurationToMicros(raw, name);
  return raw;
}

export function loadConfig() {
  const baseUrl = process.env.OPENOBSERVE_BASE_URL;
  const orgId = process.env.OPENOBSERVE_ORG_ID || "default";
  const username = process.env.OPENOBSERVE_USERNAME;
  const password = process.env.OPENOBSERVE_PASSWORD;

  if (!baseUrl) {
    throw new Error("Missing OPENOBSERVE_BASE_URL");
  }

  if (!(username && password)) {
    throw new Error("Provide OPENOBSERVE_USERNAME and OPENOBSERVE_PASSWORD");
  }

  const maskFields = (process.env.OPENOBSERVE_MASK_FIELDS ?? DEFAULT_MASK_FIELDS.join(","))
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);
  const { maxRangeMicros, maxRangeLabel } = parseMaxRangeConfig();

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    orgId,
    username,
    password,
    defaultLogStream: process.env.OPENOBSERVE_DEFAULT_LOG_STREAM || undefined,
    defaultTraceStream: process.env.OPENOBSERVE_DEFAULT_TRACE_STREAM || undefined,
    defaultLookback: parseDurationEnv("OPENOBSERVE_DEFAULT_LOOKBACK", "3d"),
    defaultLogRows: parseNonNegativeIntEnv("OPENOBSERVE_DEFAULT_LOG_ROWS", 100),
    defaultStreamRows: parseNonNegativeIntEnv("OPENOBSERVE_DEFAULT_STREAM_ROWS", 100),
    // 0 means "do not enforce an upper bound" for experience-first usage.
    maxRangeMicros,
    maxRangeLabel,
    maxLogRows: parseNonNegativeIntEnv("OPENOBSERVE_MAX_LOG_ROWS", 500),
    maxStreamRows: parseNonNegativeIntEnv("OPENOBSERVE_MAX_STREAM_ROWS", 500),
    maskFields,
  };
}
