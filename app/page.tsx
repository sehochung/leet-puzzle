import Link from "next/link";
import { loadAllPuzzles } from "@/lib/puzzles";
import type { Topic } from "@/lib/puzzle";

const TOPIC_LABEL: Record<Topic, string> = {
  hashmap: "Hash Map",
  "two-pointer": "Two Pointer",
  "sliding-window": "Sliding Window",
  "binary-search": "Binary Search",
  dp: "Dynamic Programming",
};

export default async function Home() {
  const { puzzles, errors } = await loadAllPuzzles();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Interview Intuition Trainer</h1>
        <p className="mt-1 text-sm opacity-70">
          Daily interview-intuition drills — one base problem, five quick rounds.
        </p>
        <Link
          href="/today"
          className="mt-4 inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          {"Play today's puzzle →"}
        </Link>
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

      <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
        <div className="grid grid-cols-[2.5rem_1fr_6.5rem] gap-3 border-b border-black/10 bg-black/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide opacity-60 dark:border-white/15 dark:bg-white/5 sm:grid-cols-[2.5rem_1fr_6.5rem_10rem]">
          <span>#</span>
          <span>Title</span>
          <span>Date</span>
          <span className="hidden sm:block">Topic</span>
        </div>

        {puzzles.map((p) => {
          const n = Number(p.id.slice("puzzle-".length));
          return (
            <Link
              key={p.id}
              href={`/puzzle/${p.id}`}
              className="grid grid-cols-[2.5rem_1fr_6.5rem] items-center gap-3 border-b border-black/5 px-4 py-3 transition-colors last:border-b-0 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 sm:grid-cols-[2.5rem_1fr_6.5rem_10rem]"
            >
              <span className="tabular-nums opacity-60">{n}</span>
              <span className="font-medium">{p.title}</span>
              <span className="text-sm tabular-nums opacity-70">{p.date}</span>
              <span className="hidden truncate text-sm opacity-60 sm:block">{TOPIC_LABEL[p.topic]}</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
