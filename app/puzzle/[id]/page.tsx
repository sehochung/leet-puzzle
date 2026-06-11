import { notFound } from "next/navigation";
import { loadBridgesForPuzzle } from "@/lib/bridges";
import { loadPuzzleById } from "@/lib/puzzles";
import Player from "./Player";

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
  return <Player puzzle={puzzle} bridges={bridges} />;
}
