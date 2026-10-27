const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** `24576` as `24 KB`. Null stays empty: a dialect with no size to report shows nothing. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unit]}`;
}

/** A timestamp from the database as a local date and time, or "never" when it has not happened. */
export function formatWhen(timestamp: string | null): string {
  if (timestamp === null) return "never";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}
