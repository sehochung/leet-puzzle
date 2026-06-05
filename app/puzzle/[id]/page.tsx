import { notFound } from "next/navigation";
import { loadPuzzleById } from "@/lib/puzzles";
import Player from "./Player";

// Next 15+ async params. loadPuzzleById validates the id against /^puzzle-\d{3}$/
// BEFORE any filesystem access, so traversal attempts (e.g. "../etc/passwd")
// return null here and fall through to notFound().
export default async function PuzzlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const puzzle = await loadPuzzleById(id);
  if (!puzzle) notFound();
  return <Player puzzle={puzzle} />;
}
