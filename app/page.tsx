import { loadAllPuzzles } from "@/lib/puzzles";
import { selectTodayPuzzleId } from "@/lib/today";
import GameHub, { type PuzzleMeta } from "./GameHub";

// Render per-request so Next stamps the proxy's per-request CSP nonce onto this page's
// inline bootstrap script, and so today's puzzle is picked from the request date.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { puzzles, errors } = await loadAllPuzzles();
  const meta: PuzzleMeta[] = puzzles.map((p) => ({
    id: p.id,
    title: p.title,
    date: p.date,
    topic: p.topic,
  }));
  const todayId = selectTodayPuzzleId(puzzles.map((p) => p.id));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Interview Intuition Trainer</h1>
        <p className="mt-1 text-sm opacity-70">
          Build the solution, survive the follow-ups, keep the streak.
        </p>
      </header>

      {errors.length > 0 && (
        <div className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          <p className="font-semibold">Some puzzles failed to load:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <GameHub puzzles={meta} todayId={todayId} />
    </main>
  );
}
