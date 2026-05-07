const MICROS_IN_SECOND = 1_000_000;
const MICROS_IN_MINUTE = 60 * MICROS_IN_SECOND;
const MICROS_IN_HOUR = 60 * MICROS_IN_MINUTE;

export function nowMicros() {
  return Date.now() * 1_000;
}

export function hoursToMicros(hours) {
  return hours * MICROS_IN_HOUR;
}

export function minutesToMicros(minutes) {
  return minutes * MICROS_IN_MINUTE;
}

export function resolveTimeRange({
  startTime,
  endTime,
  lookbackMinutes,
  defaultLookbackMinutes,
  maxHours,
}) {
  const now = nowMicros();
  const effectiveEnd = endTime ?? now;
  const fallbackMinutes = lookbackMinutes ?? defaultLookbackMinutes;
  const effectiveStart = startTime ?? (effectiveEnd - minutesToMicros(fallbackMinutes));

  if (effectiveStart >= effectiveEnd) {
    throw new Error("startTime must be smaller than endTime");
  }

  const maxRange = hoursToMicros(maxHours);
  if ((effectiveEnd - effectiveStart) > maxRange) {
    throw new Error(`Requested time range exceeds ${maxHours} hours`);
  }

  return {
    startTime: effectiveStart,
    endTime: effectiveEnd,
  };
}

export function formatMicros(micros) {
  return new Date(Math.floor(micros / 1_000)).toISOString();
}
