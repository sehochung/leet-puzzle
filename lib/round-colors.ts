// Round↔code wayfinding palette, pinned by the mechanic spec. Low-saturation on
// purpose — these read as wayfinding, not decoration. Do NOT increase saturation
// and do NOT use them anywhere except: the round selector chips, the code lines
// owned by each round, the round-question indicator, and the debugger-panel
// section accents. Values are dynamic per round, so they're applied via inline
// style (Tailwind can't see runtime-built arbitrary classes at scan time).

export const ROUND_COLORS: readonly [string, string, string, string, string] = [
  "#7BA7BC", // round 1 · state     — muted cool blue
  "#9ABC7B", // round 2 · iterate   — muted sage green
  "#BC9F7B", // round 3 · transform — muted amber
  "#A87BBC", // round 4 · update    — muted lavender
  "#BC7B85", // round 5 · output    — muted dusty rose
];

// Tuple access with a runtime index is `string | undefined` under
// noUncheckedIndexedAccess; the fallback keeps callers unconditional.
export function roundColor(roundIdx: number): string {
  return ROUND_COLORS[roundIdx] ?? "#888888";
}

// The palette is hex-only, so alpha variants are derived here instead of
// hand-maintaining a second palette.
export function roundColorAlpha(roundIdx: number, alpha: number): string {
  const hex = roundColor(roundIdx);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
