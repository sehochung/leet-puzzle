// Client-side progression: XP, engineer-rank ladder, daily streak, and per-puzzle
// best results — all in localStorage (no account, no network). Everything here is
// SSR-safe: reads return a default when window/localStorage is unavailable, and
// writes are best-effort (a full quota or blocked storage never throws into the UI).
//
// XP is improvement-based: replaying a puzzle only awards the delta over your best
// previous run, so grinding one puzzle can't farm rank — improving on it can.

import { dayIndex } from "./today";

export type StoredResult = {
  firstPickScore: number; // 0..5, from the best-XP run
  roundCorrect: boolean[]; // per-round first-pick correctness, same run
  testsPassed: number;
  testsTotal: number;
  lightningScore: number | null; // null = lightning not played that run
  lightningTotal: number | null;
  bestXp: number; // the XP value of the best run (baseline for improvement deltas)
  completedAt: string; // ISO, most recent completion
  plays: number;
};

export type Progress = {
  version: 1;
  xp: number;
  results: Record<string, StoredResult>;
  streak: { current: number; best: number; lastDailyDay: number | null };
  // Day indexes (lib/today.ts dayIndex) on which the daily puzzle was completed —
  // drives the hub's heatmap calendar.
  dailyDays: number[];
};

export type Rank = { title: string; minXp: number };

// Thresholds sized so 10 clean puzzles (~165 XP each with lightning) span the ladder.
export const RANKS: readonly Rank[] = [
  { title: "Intern", minXp: 0 },
  { title: "Junior Engineer", minXp: 100 },
  { title: "Engineer", minXp: 250 },
  { title: "Senior Engineer", minXp: 500 },
  { title: "Staff Engineer", minXp: 900 },
  { title: "Principal Engineer", minXp: 1400 },
  { title: "Distinguished Engineer", minXp: 2000 },
] as const;

const KEY = "iit-progress-v1";

const DEFAULT: Progress = {
  version: 1,
  xp: 0,
  results: {},
  streak: { current: 0, best: 0, lastDailyDay: null },
  dailyDays: [],
};

export function loadProgress(): Progress {
  if (typeof window === "undefined") return structuredClone(DEFAULT);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      return structuredClone(DEFAULT);
    }
    // Trust our own v1 shape past the version gate; a corrupted field at worst
    // resets on the next save. Merging over DEFAULT fills any missing key.
    return { ...structuredClone(DEFAULT), ...(parsed as Partial<Progress>), version: 1 };
  } catch {
    return structuredClone(DEFAULT);
  }
}

function saveProgress(p: Progress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage full/blocked — progression silently degrades to per-session.
  }
}

export type RunSummary = {
  firstPickScore: number;
  roundCorrect: boolean[];
  testsPassed: number;
  testsTotal: number;
  lightningScore: number | null;
  lightningTotal: number | null;
};

export function computeXp(s: RunSummary): number {
  return s.firstPickScore * 20 + s.testsPassed * 5 + (s.lightningScore ?? 0) * 15;
}

export function rankForXp(xp: number): { rank: Rank; next: Rank | null; progress: number } {
  let rank: Rank = RANKS[0] ?? { title: "Intern", minXp: 0 };
  let next: Rank | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    const r = RANKS[i];
    if (r && xp >= r.minXp) {
      rank = r;
      next = RANKS[i + 1] ?? null;
    }
  }
  const progress = next ? (xp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return { rank, next, progress: Math.min(Math.max(progress, 0), 1) };
}

export type Award = {
  xpGained: number;
  totalXp: number;
  rank: Rank;
  next: Rank | null;
  rankProgress: number;
  rankedUp: boolean;
  streak: Progress["streak"];
  // True when this completion extended (or started) the daily streak just now.
  streakExtended: boolean;
};

// Record a finished run. Streak/daily-log updates only apply when `isDaily`
// (the puzzle being played is today's rotation pick). Always safe to call more
// than once — XP is the improvement delta and the streak is idempotent per day.
export function recordCompletion(puzzleId: string, s: RunSummary, isDaily: boolean): Award {
  const p = loadProgress();
  const prevRank = rankForXp(p.xp).rank;

  const runXp = computeXp(s);
  const prev = p.results[puzzleId];
  const xpGained = Math.max(0, runXp - (prev?.bestXp ?? 0));
  const now = new Date();

  if (!prev || runXp > prev.bestXp) {
    p.results[puzzleId] = {
      firstPickScore: s.firstPickScore,
      roundCorrect: [...s.roundCorrect],
      testsPassed: s.testsPassed,
      testsTotal: s.testsTotal,
      lightningScore: s.lightningScore,
      lightningTotal: s.lightningTotal,
      bestXp: runXp,
      completedAt: now.toISOString(),
      plays: (prev?.plays ?? 0) + 1,
    };
  } else {
    prev.plays += 1;
    prev.completedAt = now.toISOString();
  }

  p.xp += xpGained;

  let streakExtended = false;
  if (isDaily) {
    const today = dayIndex(now);
    if (p.streak.lastDailyDay !== today) {
      p.streak.current = p.streak.lastDailyDay === today - 1 ? p.streak.current + 1 : 1;
      p.streak.best = Math.max(p.streak.best, p.streak.current);
      p.streak.lastDailyDay = today;
      streakExtended = true;
    }
    if (!p.dailyDays.includes(today)) p.dailyDays.push(today);
  }

  saveProgress(p);

  const { rank, next, progress } = rankForXp(p.xp);
  return {
    xpGained,
    totalXp: p.xp,
    rank,
    next,
    rankProgress: progress,
    rankedUp: rank.minXp > prevRank.minXp,
    streak: { ...p.streak },
    streakExtended,
  };
}

// A streak is "alive" if the last daily completion was today or yesterday.
export function streakAlive(streak: Progress["streak"], now: Date = new Date()): boolean {
  if (streak.lastDailyDay === null) return false;
  const today = dayIndex(now);
  return streak.lastDailyDay === today || streak.lastDailyDay === today - 1;
}
