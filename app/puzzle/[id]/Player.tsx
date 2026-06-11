"use client";

import { useState } from "react";
import Link from "next/link";
import type { Language, Puzzle } from "@/lib/puzzle";
import { buildConstructedCode } from "@/lib/build-code";
import { runSolution, parseEntryPoint, type TestRunResult } from "@/lib/run-python";
import ConstructedCode from "./ConstructedCode";
import DiffPanel from "./DiffPanel";
import ReviewDiff from "./ReviewDiff";
import TestResults from "./TestResults";

type Answer = { chosen: 0 | 1 | 2 | 3; correct: boolean };

// The corrective flow: each pick locks on first click and reveals correctness immediately;
// the editor fills in the CANONICAL fragment for every locked round (wrong picks get
// corrected), so the algorithm always builds right. After round 5: "ready" (full solution +
// Run button), "running" (Pyodide), then "results".
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
  const [results, setResults] = useState<TestRunResult[] | null>(null);

  // roundIdx is always within [0,4]; the guard satisfies the tuple's `| undefined`
  // under noUncheckedIndexedAccess.
  const round = puzzle.rounds[roundIdx];
  if (!round) return null;

  const correctIndex = round.correctIndex;
  const isLast = roundIdx === puzzle.rounds.length - 1;
  const current = answers[roundIdx] ?? null;
  const correctCount = answers.filter((a) => a?.correct).length;
  // The player's OWN pick per round (null until answered) — drives the end-screen review.
  const picks = answers.map((a) => (a ? a.chosen : null));
  // Rounds lock strictly in order, so the locked count is a prefix length — it drives how
  // much of the editor is filled (with canonical code).
  const lockedCount = answers.filter((a) => a !== null).length;

  // First click locks the round (score is first-pick correctness) and reveals immediately;
  // the editor fills the canonical fragment either way (corrective build). The guard lives
  // inside the updater so a fast double-click can't overwrite the locked answer.
  function choose(i: 0 | 1 | 2 | 3) {
    if (phase !== "building") return;
    setAnswers((prev) => {
      if (prev[roundIdx]) return prev;
      const next = [...prev];
      next[roundIdx] = { chosen: i, correct: i === correctIndex };
      return next;
    });
  }

  // Advance past the locked round; after the last round we land on "ready" (Run screen).
  function next() {
    if (phase !== "building") return;
    if (isLast) setPhase("ready");
    else setRoundIdx((i) => i + 1);
  }

  // Run the constructed Python in Pyodide against the tests, then reveal everything. runSolution
  // never throws (load/syntax/per-test failures come back as error results), so no try/catch.
  async function run() {
    setPhase("running");
    const code = buildConstructedCode(puzzle, 5, "python");
    const entry = parseEntryPoint(puzzle.canonicalSolutions.python);
    const r = await runSolution(code, entry, puzzle.tests);
    setResults(r);
    setPhase("results");
  }

  function reset() {
    setRoundIdx(0);
    setAnswers(EMPTY);
    setResults(null);
    setPhase("building"); // language intentionally kept; Pyodide stays loaded for the next run
  }

  // Locked rounds show first-pick correctness immediately; the current round is highlighted;
  // upcoming rounds are muted. Squares are visual progress only — never clickable.
  function squareClass(idx: number): string {
    const a = answers[idx];
    if (a) return a.correct ? "bg-green-600 text-white" : "bg-red-600 text-white";
    if (idx === roundIdx && phase === "building") {
      return "bg-blue-100 text-blue-900 ring-2 ring-blue-500";
    }
    return "bg-gray-200 text-gray-500";
  }

  // Until the round locks: neutral with hover. After: canonical green, the player's wrong
  // pick red, the rest dimmed — the per-round reveal.
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

  const isBuilding = phase === "building";
  const showBuildPanel = phase === "building" || phase === "ready" || phase === "running";

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

      {/* [B2] Construction panel — the code editor: every locked round holds the CANONICAL
          fragment (corrective build), unlocked rounds a placeholder. Canonical-only is the
          preserved session-004 fallback. */}
      {showBuildPanel && (
        <section className="mt-6">
          <div className="mb-2 flex justify-end">
            <LangToggle language={language} setLanguage={setLanguage} />
          </div>
          {puzzle.constructionMode === "diff" ? (
            <DiffPanel puzzle={puzzle} filledThroughRound={lockedCount} language={language} />
          ) : (
            <ConstructedCode
              puzzle={puzzle}
              completedThroughRound={lockedCount}
              language={language}
            />
          )}
        </section>
      )}

      {/* [C] Active round — one pick, then it locks and reveals */}
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
                disabled={current !== null}
                onClick={() => choose(i as 0 | 1 | 2 | 3)}
                className={`w-full rounded-lg px-4 py-3 text-left text-sm transition-colors ${optionClass(i)}`}
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

      {/* [E] Ready/running — full neutral solution above; run it (Python) or switch to Python (Java) */}
      {(phase === "ready" || phase === "running") && (
        <section className="mt-6">
          {language === "python" ? (
            <button
              type="button"
              onClick={run}
              disabled={phase === "running"}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-default disabled:opacity-70"
            >
              {phase === "running" ? "Loading Python runtime…" : "Run solution →"}
            </button>
          ) : (
            <p className="rounded-lg border border-black/10 bg-black/[0.03] p-4 text-sm leading-relaxed opacity-80 dark:border-white/15 dark:bg-white/5">
              Running is Python-only. Switch the language toggle to Python to run your solution —
              the review below works in either language.
            </p>
          )}
          {/* Java has no run step, so the full reveal lives right here under the note. */}
          {language === "java" && phase === "ready" && Results()}
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

        {/* Test results — the payoff the build was aimed at; Python-only (Pyodide). */}
        {language === "python" ? (
          results && (
            <div className="mt-6">
              <TestResults results={results} />
            </div>
          )
        ) : (
          <p className="mt-6 rounded-lg border border-black/10 bg-black/[0.03] p-4 text-sm leading-relaxed opacity-80 dark:border-white/15 dark:bg-white/5">
            Switch to Python to run your solution against the test cases — execution is Python-only.
          </p>
        )}

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
