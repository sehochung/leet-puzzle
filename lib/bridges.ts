import { readFile } from "node:fs/promises";
import { join } from "node:path";

// One bridging interaction for a specific wrong pick. The UI receives this object
// as a prop and never loads it itself — that decoupling is the architectural point:
// a future LLM-generated bridge only has to swap THIS resolver, not the UI.
export type Bridge = {
  question: string;
  trace_setup: string; // self-contained Python snippet; prints the consequence
  follow_up: string;
};

// Resolved bridges for one puzzle, keyed "<roundIdx>:<optionIdx>" (both 0-based).
export type BridgeMap = Record<string, Bridge>;

function isBridge(v: unknown): v is Bridge {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Bridge).question === "string" &&
    typeof (v as Bridge).trace_setup === "string" &&
    typeof (v as Bridge).follow_up === "string"
  );
}

// Server-side resolver: reads puzzles/bridges.json (validated at build time by
// scripts/validate-puzzles.mjs) and flattens this puzzle's entries. A missing file,
// puzzle, or malformed entry degrades to {} — every wrong pick then gets the
// generic fallback in the UI, never an error.
export async function loadBridgesForPuzzle(puzzleId: string): Promise<BridgeMap> {
  const out: BridgeMap = {};
  try {
    const raw = await readFile(join(process.cwd(), "puzzles", "bridges.json"), "utf8");
    const all = JSON.parse(raw) as Record<string, unknown>;
    const rounds = all[puzzleId];
    if (typeof rounds !== "object" || rounds === null) return out;
    for (const [rkey, opts] of Object.entries(rounds)) {
      const m = rkey.match(/^round-([1-5])$/);
      if (!m || typeof opts !== "object" || opts === null) continue;
      for (const [okey, bridge] of Object.entries(opts)) {
        if (/^[0-3]$/.test(okey) && isBridge(bridge)) {
          out[`${Number(m[1]) - 1}:${okey}`] = {
            question: bridge.question,
            trace_setup: bridge.trace_setup,
            follow_up: bridge.follow_up,
          };
        }
      }
    }
  } catch {
    // fall through to {}
  }
  return out;
}
