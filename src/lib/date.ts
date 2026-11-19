/**
 * Converts a duration in nanoseconds to rounded milliseconds.
 */
export function nsToMs(ns?: number): number | undefined {
  if (typeof ns !== "number" || !Number.isFinite(ns) || ns < 0) {
    return undefined;
  }
  return Math.round(ns / 1_000_000);
}
