"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Topic } from "@/lib/puzzle";
import { loadProgress, rankForXp, streakAlive, type Progress } from "@/lib/progress";
import { dayIndex, LAUNCH_EPOCH_UTC } from "@/lib/today";

const TOPIC_LABEL: Record<Topic, string> = {
  hashmap: "Hash Map",
  "two-pointer": "Two Pointer",
  "sliding-window": "Sliding Window",
  "binary-search": "Binary Search",
  dp: "Dynamic Programming",
};

// Serializable puzzle metadata handed down from the server page — the client
// hub never loads puzzle JSON itself.
export type PuzzleMeta = {
  id: string;
  title: string;
  date: string;
  topic: Topic;
};

export type DesignMeta = {
  id: string;
  title: string;
};

const DAY_MS = 86_400_000;

function dateLabelForDay(d: number): string {
  return new Date(LAUNCH_EPOCH_UTC + d * DAY_MS).toISOString().slice(0, 10);
}

export default function GameHub({
  puzzles,
  designs,
  todayId,
}: {
  puzzles: PuzzleMeta[];
  designs: DesignMeta[];
  todayId: string | null;
}) {
  // Progress lives in localStorage, so it can only be read after mount — the
  // server render (and first client render) shows the zero-state, then this
  // effect fills in the real numbers. Prevents a hydration mismatch.
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const p = progress;
  const xp = p?.xp ?? 0;
  const { rank, next, progress: rankProgress } = rankForXp(xp);
  const solved = p ? Object.keys(p.results).filter((k) => k.startsWith("puzzle-")).length : 0;
  const designSolved = p
    ? Object.keys(p.results).filter((k) => k.startsWith("design-")).length
    : 0;
  const today = dayIndex(new Date());
  const todayPuzzle = puzzles.find((x) => x.id === todayId) ?? null;
  const doneToday = p !== null && p.streak.lastDailyDay === today;
  const alive = p !== null && streakAlive(p.streak);
  const streakShown = alive ? p.streak.current : 0;

  return (
    <>
      {/* Daily challenge hero */}
      {todayPuzzle && (
        <section className="rounded-xl border border-black/10 p-5 dark:border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                Daily challenge · Day {today + 1}
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight">{todayPuzzle.title}</h2>
              <p className="mt-0.5 text-sm opacity-60">{TOPIC_LABEL[todayPuzzle.topic]}</p>
            </div>
            {doneToday ? (
              <div className="flex items-center gap-3">
                <span className="rounded-md border border-green-600/40 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-400">
                  ✓ Solved today
                  {p && p.results[todayPuzzle.id]
                    ? ` · ${p.results[todayPuzzle.id]?.firstPickScore}/5`
                    : ""}
                </span>
                <Link
                  href={`/puzzle/${todayPuzzle.id}`}
                  className="rounded-lg border border-black/15 px-4 py-2 text-sm font-semibold transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
                >
                  Replay →
                </Link>
              </div>
            ) : (
              <Link
                href="/today"
                className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Play →
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Stats row: rank / streak / solved */}
      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Rank</p>
          <p className="mt-1 font-bold">{rank.title}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-700"
              style={{ width: `${Math.round(rankProgress * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums opacity-60">
            {xp} XP{next ? ` · ${next.minXp - xp} to ${next.title}` : " · max rank"}
          </p>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Streak</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${alive ? "" : "opacity-40"}`}>
            {"\u{1F525}"} {streakShown}
          </p>
          <p className="mt-1 text-xs opacity-60">
            best {p?.streak.best ?? 0}
            {!doneToday && todayPuzzle ? " · play today to keep it" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Solved</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {solved}
            <span className="text-sm font-semibold opacity-50">/{puzzles.length}</span>
          </p>
          <p className="mt-1 text-xs opacity-60">puzzles completed</p>
        </div>
      </section>

      {/* Daily heatmap since launch */}
      {today >= 0 && (
        <section className="mt-4 rounded-xl border border-black/10 p-4 dark:border-white/15">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Daily history</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Array.from({ length: today + 1 }, (_, d) => {
              const done = p?.dailyDays.includes(d) ?? false;
              const isToday = d === today;
              return (
                <div
                  key={d}
                  title={dateLabelForDay(d)}
                  className={`h-4 w-4 rounded-sm ${
                    done ? "bg-green-600" : "bg-black/10 dark:bg-white/15"
                  } ${isToday ? "ring-2 ring-blue-500" : ""}`}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* System design track */}
      {designs.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
              System design track
            </p>
            <p className="text-xs tabular-nums opacity-50">
              {designSolved}/{designs.length} designed
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {designs.map((d) => {
              const r = p?.results[d.id];
              return (
                <Link
                  key={d.id}
                  href={`/design/${d.id}`}
                  className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 transition-colors hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                >
                  <span className="font-medium">{d.title}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {r ? (
                      <span className={r.firstPickScore === 5 ? "text-green-600" : "opacity-80"}>
                        {r.firstPickScore}/5
                      </span>
                    ) : (
                      <span className="opacity-30">—</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Puzzle list with completion badges */}
      <div className="mt-6 overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
        <div className="grid grid-cols-[2.5rem_1fr_5rem] gap-3 border-b border-black/10 bg-black/5 px-4 py-2 text-xs font-semibold uppercase tracking-wide opacity-60 dark:border-white/15 dark:bg-white/5 sm:grid-cols-[2.5rem_1fr_9rem_5rem]">
          <span>#</span>
          <span>Title</span>
          <span className="hidden sm:block">Topic</span>
          <span className="text-right">Best</span>
        </div>
        {puzzles.map((x) => {
          const n = Number(x.id.slice("puzzle-".length));
          const r = p?.results[x.id];
          return (
            <Link
              key={x.id}
              href={`/puzzle/${x.id}`}
              className="grid grid-cols-[2.5rem_1fr_5rem] items-center gap-3 border-b border-black/5 px-4 py-3 transition-colors last:border-b-0 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 sm:grid-cols-[2.5rem_1fr_9rem_5rem]"
            >
              <span className="tabular-nums opacity-60">{n}</span>
              <span className="flex items-center gap-2 font-medium">
                {x.title}
                {x.id === todayId && (
                  <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Today
                  </span>
                )}
              </span>
              <span className="hidden truncate text-sm opacity-60 sm:block">
                {TOPIC_LABEL[x.topic]}
              </span>
              <span className="text-right text-sm font-semibold tabular-nums">
                {r ? (
                  <span className={r.firstPickScore === 5 ? "text-green-600" : "opacity-80"}>
                    {r.firstPickScore}/5
                  </span>
                ) : (
                  <span className="opacity-30">—</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
