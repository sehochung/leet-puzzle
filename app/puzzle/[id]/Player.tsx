"use client";

import { useState } from "react";
import Link from "next/link";
import type { Language, Puzzle } from "@/lib/puzzle";
import { buildConstructedCode } from "@/lib/build-code";
import ConstructedCode from "./ConstructedCode";
import DiffPanel from "./DiffPanel";
import ReviewDiff from "./ReviewDiff";

type Answer = { chosen: 0 | 1 | 2 | 3; correct: boolean };

// The blind-build flow: pick all 5 with NO correctness reveal ("building"), land on a neutral
// full-solution view with a Run button ("ready"), then reveal everything ("results"). "running"
// is the Pyodide load/execute interlude (wired in a later phase).
type Phase = "building" | "ready" | "running" | "results";

const EMPTY: Array<Answer | null> = [null, null, null, null, null];

function LangToggle({
  language,
  setLanguage,
}: {
  language: Language;
  setLanguage: (l: Language) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-black/15 p-0.5 text-xs font-semibold dark:border-white/20">
      {(["python", "java"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLanguage(l)}
          className={`rounded px-2.5 py-1 transition-colors ${
            language === l ? "bg-blue-600 text-white" : "opacity-60 hover:opacity-100"
          }`}
        >
          {l === "python" ? "Python" : "Java"}
        </button>
      ))}
    </div>
  );
}

export default function Player({ puzzle }: { puzzle: Puzzle }) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [answers, setAnswers] = useState<Array<Answer | null>>(EMPTY);
  const [phase, setPhase] = useState<Phase>("building");
  const [language, setLanguage] = useState<Language>("python");

  // roundIdx is always within [0,4]; the guard satisfies the tuple's `| undefined`
  // under noUncheckedIndexedAccess.
  const round = puzzle.rounds[roundIdx];
  if (!round) return null;

  const correctIndex = round.correctIndex;
  const isLast = roundIdx === puzzle.rounds.length - 1;
  const current = answers[roundIdx] ?? null;
  const correctCount = answers.filter((a) => a?.correct).length;
  // The player's OWN pick per round (null until answered) — drives the panels.
  const picks = answers.map((a) => (a ? a.chosen : null));
  // Canonical-only fallback: how many stages the (non-diff) panel reveals.
  const selectedCount = answers.filter((a) => a !== null).length;

  // Pick (or re-pick — changeable until "Next") with NO reveal: correctness is recorded for the
  // end screen but never shown during the build.
  function choose(i: 0 | 1 | 2 | 3) {
    if (phase !== "building") return;
    setAnswers((prev) => {
      const next = [...prev];
      next[roundIdx] = { chosen: i, correct: i === correctIndex };
      return next;
    });
  }

  // Commit the current pick and advance; after the last round we land on "ready" (Run screen).
  function next() {
    if (phase !== "building") return;
    if (isLast) setPhase("ready");
    else setRoundIdx((i) => i + 1);
  }

  // Phase 1: "Run" reveals the correctness diff without executing. Pyodide wiring replaces this.
  function run() {
    setPhase("results");
  }

  function reset() {
    setRoundIdx(0);
    setAnswers(EMPTY);
    setPhase("building"); // language intentionally kept
  }

  function squareClass(idx: number): string {
    if (phase === "results") {
      return answers[idx]?.correct ? "bg-green-600 text-white" : "bg-red-600 text-white";
    }
    if (idx === roundIdx && phase === "building") {
      return "bg-blue-100 text-blue-900 ring-2 ring-blue-500";
    }
    if (answers[idx] !== null) return "bg-blue-600 text-white"; // selected, correctness hidden
    return "bg-gray-200 text-gray-500";
  }

  // Building only: neutral until picked, blue outline once selected — never green/red.
  function optionClass(i: number): string {
    if (current?.chosen === i) {
      return "border-2 border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-500/15 dark:text-white";
    }
    return "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5";
  }

  const isBuilding = phase === "building";
  const showBuildPanel = phase === "building" || phase === "ready";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm opacity-60 transition-colors hover:opacity-100">
        ← All puzzles
      </Link>

      {/* [A] Progress strip */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {puzzle.rounds.map((r, idx) => (
          <div
            key={r.id}
            className={`flex h-10 items-center justify-center rounded-md text-sm font-semibold transition-colors ${squareClass(idx)}`}
          >
            {idx + 1}
          </div>
        ))}
      </div>

      {/* [B] Base problem card */}
      <section className="mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15">
        <h1 className="text-xl font-bold tracking-tight">{puzzle.title}</h1>
        <p className="mt-2 text-sm leading-relaxed opacity-80">{puzzle.baseProblem.statement}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Input</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
              {JSON.stringify(puzzle.baseProblem.example.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Output</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
              {JSON.stringify(puzzle.baseProblem.example.output, null, 2)}
            </pre>
          </div>
        </div>
      </section>

      {/* [B2] Construction panel — the player's picks build here in NEUTRAL during the blind build
          (no green/red): they reason about coherence before the reveal. Canonical-only is the
          preserved session-004 fallback. */}
      {showBuildPanel && (
        <section className="mt-6">
          <div className="mb-2 flex justify-end">
            <LangToggle language={language} setLanguage={setLanguage} />
          </div>
          {puzzle.constructionMode === "diff" ? (
            <DiffPanel
              puzzle={puzzle}
              picks={picks}
              revealedThrough={puzzle.rounds.length}
              language={language}
              neutral
            />
          ) : (
            <ConstructedCode
              puzzle={puzzle}
              completedThroughRound={selectedCount}
              language={language}
            />
          )}
        </section>
      )}

      {/* [C] Active round — pick (or re-pick) with no feedback */}
      {isBuilding && (
        <section className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
            Round {roundIdx + 1} of 5 · {round.stage}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{round.question}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {round.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => choose(i as 0 | 1 | 2 | 3)}
                className={`w-full cursor-pointer rounded-lg px-4 py-3 text-left text-sm transition-colors ${optionClass(i)}`}
              >
                {opt.conceptLabel}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* [D] Next round — only once the current round has a selection */}
      {isBuilding && current && (
        <button
          type="button"
          onClick={next}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
        >
          {isLast ? "Done — review →" : "Next round →"}
        </button>
      )}

      {/* [E] Ready — full neutral solution above; run it (Python) or switch to Python (Java) */}
      {phase === "ready" && (
        <section className="mt-6">
          {language === "python" ? (
            <button
              type="button"
              onClick={run}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Run solution →
            </button>
          ) : (
            <p className="rounded-lg border border-black/10 bg-black/[0.03] p-4 text-sm leading-relaxed opacity-80 dark:border-white/15 dark:bg-white/5">
              Running is Python-only. Switch the language toggle to Python to run your solution —
              the review below works in either language.
            </p>
          )}
          {language === "java" && Results()}
        </section>
      )}

      {/* [F] Results — score + the reveal (green/red diff + rationale) */}
      {phase === "results" && Results()}
    </main>
  );

  // Results block, shared by the "results" phase and the Java "ready" state (which has no run).
  // Called as Results() (not <Results/>) so it inlines as children — re-renders don't remount
  // ReviewDiff and its rationale-toggle state survives a language switch.
  function Results() {
    return (
      <section className="mt-6 rounded-lg border border-black/10 p-6 dark:border-white/15">
        <div className="text-center">
          <p className="text-sm uppercase tracking-wide opacity-50">Your score</p>
          <p className="mt-1 text-5xl font-bold tabular-nums">{correctCount}/5</p>
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

        {puzzle.constructionMode === "diff" ? (
          /* Review — PR-style diff of your picks vs. the canonical; tap a line for why */
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Review</p>
              <LangToggle language={language} setLanguage={setLanguage} />
            </div>
            <ReviewDiff puzzle={puzzle} picks={picks} language={language} />
            <p className="mt-2 text-xs opacity-50">Tap any line to see the reasoning.</p>
          </div>
        ) : (
          <>
            {/* Solution you built */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                  Solution you built
                </p>
                <LangToggle language={language} setLanguage={setLanguage} />
              </div>
              <pre className="overflow-x-auto rounded bg-black/5 p-3 text-xs leading-relaxed dark:bg-white/10">
                <code>{buildConstructedCode(puzzle, 5, language)}</code>
              </pre>
            </div>

            {/* Per-stage breakdown: which stages you nailed vs. missed */}
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
                Stage breakdown
              </p>
              <ul className="flex flex-col gap-2">
                {puzzle.rounds.map((r, i) => {
                  const ok = answers[i]?.correct;
                  return (
                    <li key={r.id} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1 font-bold ${ok ? "text-green-600" : "text-red-600"}`}>
                        {ok ? "✓" : "✗"}
                      </span>
                      <span className="mt-1 w-20 shrink-0 font-semibold opacity-70">{r.stage}</span>
                      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded bg-black/5 px-1.5 py-1 opacity-80 dark:bg-white/10">
                        {r.options[r.correctIndex].fragments[language]}
                      </code>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
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
    );
  }
}
