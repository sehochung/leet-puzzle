// Deterministic daily-puzzle rotation. Pure and dependency-free so it is
// unit-testable and gives an identical answer on the server and the client.
// Picks one puzzle per UTC calendar day, cycling through the available puzzles
// so a daily puzzle ALWAYS resolves — even past the last authored date. Day 0
// (LAUNCH_EPOCH_UTC) maps to the first puzzle in id order.

// The first daily puzzle's date, as a UTC-midnight epoch. Kept in sync with
// puzzle-001's `date` (2026-06-01). Months are 0-based in Date.UTC.
export const LAUNCH_EPOCH_UTC = Date.UTC(2026, 5, 1);

const DAY_MS = 86_400_000;

// Whole UTC days from LAUNCH_EPOCH to `now` (negative before launch). Computed
// off UTC-midnight on both ends so the result never depends on the wall clock's
// time-of-day or the runtime's local timezone.
export function dayIndex(now: Date, launch: number = LAUNCH_EPOCH_UTC): number {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUtc - launch) / DAY_MS);
}

// Today's puzzle id, chosen from `ids` (any order — sorted internally for a
// stable mapping). Rotation wraps with a non-negative modulo, so it works for
// dates before launch and never runs out. Returns null only for an empty list.
export function selectTodayPuzzleId(
  ids: readonly string[],
  now: Date = new Date(),
): string | null {
  if (ids.length === 0) return null;
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  const n = sorted.length;
  const idx = ((dayIndex(now) % n) + n) % n;
  return sorted[idx] ?? null;
}
