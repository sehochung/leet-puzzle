import { redirect, notFound } from "next/navigation";
import { loadAllPuzzles } from "@/lib/puzzles";
import { selectTodayPuzzleId } from "@/lib/today";

// /today -> redirects to today's puzzle, chosen by deterministic UTC-date
// rotation (see lib/today.ts). force-dynamic so the date is read per request
// rather than frozen at build time.
export const dynamic = "force-dynamic";

export default async function Today() {
  const { puzzles } = await loadAllPuzzles();
  const id = selectTodayPuzzleId(puzzles.map((p) => p.id));
  if (!id) notFound();
  redirect(`/puzzle/${id}`);
}
