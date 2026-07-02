import { notFound } from "next/navigation";
import { loadBridgesForPuzzle } from "@/lib/bridges";
import { loadAllPuzzles, loadPuzzleById } from "@/lib/puzzles";
import { selectTodayPuzzleId } from "@/lib/today";
import Player from "./Player";

// Rendered per-request: isDaily depends on the request date (and the CSP nonce
// must be stamped fresh — see proxy.ts).
export const dynamic = "force-dynamic";

// Next 15+ async params. loadPuzzleById validates the id against /^puzzle-\d{3}$/
// BEFORE any filesystem access, so traversal attempts (e.g. "../etc/passwd")
// return null here and fall through to notFound().
// Bridges are resolved HERE (the loading layer) and handed to the UI as a prop —
// a future runtime/LLM bridge source replaces loadBridgesForPuzzle only.
export default async function PuzzlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const puzzle = await loadPuzzleById(id);
  if (!puzzle) notFound();
  const bridges = await loadBridgesForPuzzle(id);
  // Streak credit only flows through today's rotation pick (see lib/progress.ts).
  const { puzzles } = await loadAllPuzzles();
  const isDaily = selectTodayPuzzleId(puzzles.map((p) => p.id)) === puzzle.id;
  return <Player puzzle={puzzle} bridges={bridges} isDaily={isDaily} />;
}
