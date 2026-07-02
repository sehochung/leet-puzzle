"use client";

import { useState } from "react";
import Link from "next/link";
import type { DesignPuzzle } from "@/lib/design";
import { recordCompletion, type Award } from "@/lib/progress";
import { buildShareText, copyToClipboard } from "@/lib/share";
import ArchDiagram from "./ArchDiagram";
import CapacityPanel from "./CapacityPanel";

// Design-mode player: the same corrective loop as the code puzzles — first
// click locks with an immediate reveal, the CANONICAL architecture assembles
// regardless of the pick (the mistake lives in the reveal and the end review),
// and the score is first-pick intuition. No execution phase: the "run" of a
// design is the capacity math, which accumulates as you go.

type Answer = { chosen: 0 | 1 | 2 | 3; correct: boolean };
type Phase = "building" | "results";

const EMPTY: Array<Answer | null> = [null, null, null, null, null];
const NARROW = "lg:mx-auto lg:w-full lg:max-w-2xl";

const STAGE_LABEL: Record<string, string> = {
  requirements: "requirements",
  api: "API",
  data: "data",
  scale: "scale",
  tradeoff: "tradeoff",
};

export default function DesignPlayer({ puzzle }: { puzzle: DesignPuzzle }) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [answers, setAnswers] = useState<Array<Answer | null>>(EMPTY);
  const [phase, setPhase] = useState<Phase>("building");
  const [award, setAward] = useState<Award | null>(null);
  const [copied, setCopied] = useState(false);

  const lockedCount = answers.filter((a) => a !== null).length;
  const round = puzzle.rounds[roundIdx];
  if (!round) return null;

  const correctIndex = round.correctIndex;
  const isLast = roundIdx === puzzle.rounds.length - 1;
  const current = answers[roundIdx] ?? null;
  const correctCount = answers.filter((a) => a?.correct).length;

  function choose(i: 0 | 1 | 2 | 3) {
    if (phase !== "building" || current) return;
    setAnswers((prev) => {
      if (prev[roundIdx]) return prev;
      const next = [...prev];
      next[roundIdx] = { chosen: i, correct: i === correctIndex };
      return next;
    });
  }

  function next() {
    if (phase !== "building" || !current) return;
    if (isLast) {
      // No test run in design mode — the round score is the whole summary.
      const roundCorrect = answers.map((a) => a?.correct ?? false);
      setAward(
        recordCompletion(
          puzzle.id,
          {
            firstPickScore: roundCorrect.filter(Boolean).length,
            roundCorrect,
            testsPassed: 0,
            testsTotal: 0,
            lightningScore: null,
            lightningTotal: null,
          },
          false, // design puzzles are a side track — the streak stays on the daily
        ),
      );
      setPhase("results");
    } else {
      setRoundIdx((i) => i + 1);
    }
  }

  function reset() {
    setRoundIdx(0);
    setAnswers(EMPTY);
    setAward(null);
    setCopied(false);
    setPhase("building");
  }

  async function share() {
    if (!award) return;
    const ok = await copyToClipboard(
      buildShareText({
        puzzleNumber: Number(puzzle.id.slice("design-".length)),
        title: puzzle.title,
        mode: "design",
        roundCorrect: answers.map((a) => a?.correct ?? false),
        testsPassed: 0,
        testsTotal: 0,
        lightningScore: null,
        lightningTotal: null,
        streak: award.streak.current,
      }),
    );
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function squareClass(idx: number): string {
    const a = answers[idx];
    if (a) return a.correct ? "bg-green-600 text-white" : "bg-red-600 text-white";
    if (idx === roundIdx && phase === "building") {
      return "bg-blue-100 text-blue-900 ring-2 ring-blue-500";
    }
    return "bg-gray-200 text-gray-500";
  }

  function optionClass(i: number): string {
    if (!current) {
      return "cursor-pointer border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5";
    }
    if (i === correctIndex) {
      return "border-2 border-green-600 bg-green-50 text-green-900 dark:bg-green-500/15 dark:text-white";
    }
    if (current.chosen === i) {
      return "border-2 border-red-600 bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-white";
    }
    return "border border-black/15 opacity-40 dark:border-white/20";
  }

  // The diagram fills with the locked count DURING the reveal too — the canonical
  // component lands the moment the round locks (the corrective mechanic).
  const filled = phase === "results" ? 5 : lockedCount;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 lg:max-w-5xl">
      <Link href="/" className="text-sm opacity-60 transition-colors hover:opacity-100">
        ← All puzzles
      </Link>

      {/* Progress strip */}
      <div className={`mt-4 grid grid-cols-5 gap-2 ${NARROW}`}>
        {puzzle.rounds.map((r, idx) => (
          <div
            key={r.id}
            className={`flex h-10 items-center justify-center rounded-md text-xs font-semibold transition-colors ${squareClass(idx)}`}
          >
            {STAGE_LABEL[r.stage]}
          </div>
        ))}
      </div>

      {/* Brief */}
      <section
        className={`mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15 ${NARROW}`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide opacity-50">System design</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight">{puzzle.title}</h1>
        <p className="mt-2 text-sm leading-relaxed opacity-80">{puzzle.brief}</p>
        <ul className="mt-3 flex flex-col gap-1 text-sm opacity-75">
          {puzzle.requirements.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="opacity-50">·</span>
              {r}
            </li>
          ))}
        </ul>
      </section>

      {/* Diagram + capacity panel — the artifact and its numbers */}
      <section className="mt-6 lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-4">
        <ArchDiagram puzzle={puzzle} filledThroughRound={filled} />
        <div className="mt-4 lg:mt-0">
          <CapacityPanel facts={puzzle.capacity} filledThroughRound={filled} />
        </div>
      </section>

      {/* Active round */}
      {phase === "building" && (
        <section className={`mt-6 ${NARROW}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
            Round {roundIdx + 1} of 5 · {STAGE_LABEL[round.stage]}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{round.question}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {round.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                disabled={current !== null}
                onClick={() => choose(i as 0 | 1 | 2 | 3)}
                className={`w-full rounded-lg px-4 py-3 text-left text-sm transition-colors ${optionClass(i)}`}
              >
                {opt.conceptLabel}
              </button>
            ))}
          </div>

          {/* Reveal: rationale for the wrong pick (if any) + the correct reasoning */}
          {current && (
            <div className="mt-4 flex flex-col gap-3">
              {!current.correct && (
                <div className="rounded-md border border-red-600/40 bg-red-50 p-3 text-sm leading-relaxed dark:bg-red-500/10">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-red-600">
                    Why your pick falls short
                  </p>
                  {round.options[current.chosen].rationale}
                </div>
              )}
              <div className="rounded-md border border-green-600/40 bg-green-50 p-3 text-sm leading-relaxed dark:bg-green-500/10">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-green-600">
                  Why this is the move
                </p>
                {round.options[correctIndex].rationale}
              </div>
              <button
                type="button"
                onClick={next}
                className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
              >
                {isLast ? "Done — review →" : "Next round →"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Results */}
      {phase === "results" && (
        <section
          className={`mt-6 rounded-lg border border-black/10 p-6 dark:border-white/15 ${NARROW}`}
        >
          <div className="text-center">
            <p className="text-sm uppercase tracking-wide opacity-50">Your score</p>
            <p className="mt-1 text-5xl font-bold tabular-nums">{correctCount}/5</p>
            <p className="mt-1 text-xs uppercase tracking-wide opacity-50">
              design calls on first pick
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {answers.map((a, idx) => (
                <div
                  key={idx}
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${
                    a?.correct ? "bg-green-600 text-white" : "bg-red-600 text-white"
                  }`}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
          </div>

          {award && (
            <div className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/15">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">
                  {award.xpGained > 0 ? (
                    <span className="text-green-600">+{award.xpGained} XP</span>
                  ) : (
                    <span className="opacity-60">+0 XP — beat your best run to earn more</span>
                  )}
                </p>
                <p className="text-xs tabular-nums opacity-60">{award.totalXp} XP total</p>
              </div>
              <div className="mt-3">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold uppercase tracking-wide opacity-70">
                    {award.rank.title}
                  </span>
                  {award.next && (
                    <span className="opacity-50">
                      {award.next.minXp - award.totalXp} XP to {award.next.title}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-700"
                    style={{ width: `${Math.round(award.rankProgress * 100)}%` }}
                  />
                </div>
              </div>
              {award.rankedUp && (
                <p className="mt-3 rounded-md border border-green-600/40 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-400">
                  Rank up! You are now {award.rank.title}.
                </p>
              )}
            </div>
          )}

          {/* Review: every round's call, your pick vs the canonical reasoning */}
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">Review</p>
            <ul className="flex flex-col gap-3">
              {puzzle.rounds.map((r, i) => {
                const a = answers[i];
                const ok = a?.correct ?? false;
                return (
                  <li key={r.id} className="rounded-lg border border-black/10 p-3 dark:border-white/15">
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                      {STAGE_LABEL[r.stage]}
                    </p>
                    <p className="mt-1 text-sm font-medium">{r.question}</p>
                    {a && !ok && (
                      <p className="mt-2 text-sm leading-relaxed">
                        <span className="font-bold text-red-600">Your pick: </span>
                        {r.options[a.chosen].conceptLabel} — {r.options[a.chosen].rationale}
                      </p>
                    )}
                    <p className="mt-2 text-sm leading-relaxed">
                      <span className="font-bold text-green-600">
                        {ok ? "Your pick (right call): " : "The move: "}
                      </span>
                      {r.options[r.correctIndex].conceptLabel} — {r.options[r.correctIndex].rationale}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {award && (
              <button
                type="button"
                onClick={share}
                className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-green-700"
              >
                {copied ? "Copied!" : "Share result"}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Play again
            </button>
            <Link
              href="/"
              className="rounded-lg border border-black/15 px-5 py-2.5 text-center font-semibold transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
            >
              Back to list
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
