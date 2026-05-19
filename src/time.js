const MICROS_IN_SECOND = 1_000_000;
const MICROS_IN_MINUTE = 60 * MICROS_IN_SECOND;
const MICROS_IN_HOUR = 60 * MICROS_IN_MINUTE;
const MICROS_IN_DAY = 24 * MICROS_IN_HOUR;

export function nowMicros() {
  return Date.now() * 1_000;
}

export function parseDurationToMicros(value, label = "duration") {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string like 7d, 12h, 30m, or 45s`);
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }

  let total = 0;
  let matched = 0;
  const pattern = /(\d+)([dhms])/g;
  for (const match of normalized.matchAll(pattern)) {
    matched += match[0].length;
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];

    if (unit === "d") total += amount * MICROS_IN_DAY;
    if (unit === "h") total += amount * MICROS_IN_HOUR;
    if (unit === "m") total += amount * MICROS_IN_MINUTE;
    if (unit === "s") total += amount * MICROS_IN_SECOND;
  }

  if (matched !== normalized.length || total < 0) {
    throw new Error(`${label} must look like 7d, 12h, 30m, 45s, or 1d12h30m`);
  }

  return total;
}

export function parseDateTimeToMicros(value, label = "time") {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a datetime string like 2026-05-19 10:09:14`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must not be empty`);
  }

  const isoLike = normalized.includes("T")
    ? normalized
    : normalized.replace(" ", "T");
  const millis = Date.parse(isoLike);

  if (Number.isNaN(millis)) {
    throw new Error(`${label} must look like 2026-05-19 10:09:14 or 2026-05-19T10:09:14Z`);
  }

  return millis * 1_000;
}

export function resolveTimeRange({
  start,
  end,
  startTime,
  endTime,
  lookback,
  defaultLookback,
  maxRangeMicros,
  maxRangeLabel,
}) {
  const now = nowMicros();
  const parsedStart = start ? parseDateTimeToMicros(start, "start") : undefined;
  const parsedEnd = end ? parseDateTimeToMicros(end, "end") : undefined;
  const effectiveEnd = endTime ?? parsedEnd ?? now;
  const fallbackLookback = lookback ?? defaultLookback;
  const effectiveStart = startTime ?? parsedStart ?? (effectiveEnd - parseDurationToMicros(fallbackLookback, "lookback"));

  if (effectiveStart >= effectiveEnd) {
    throw new Error("startTime must be smaller than endTime");
  }

  if (maxRangeMicros > 0) {
    if ((effectiveEnd - effectiveStart) > maxRangeMicros) {
      throw new Error(`Requested time range exceeds ${maxRangeLabel ?? "the configured maximum range"}`);
    }
  }

  return {
    startTime: effectiveStart,
    endTime: effectiveEnd,
  };
}

export function formatMicros(micros) {
  return new Date(Math.floor(micros / 1_000)).toISOString();
}
