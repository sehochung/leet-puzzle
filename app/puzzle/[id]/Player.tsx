"use client";

import { useState } from "react";
import Link from "next/link";
import type { Language, Puzzle } from "@/lib/puzzle";
import { buildConstructedCode } from "@/lib/build-code";
import ConstructedCode from "./ConstructedCode";
import DiffPanel from "./DiffPanel";

type Answer = { chosen: 0 | 1 | 2 | 3; correct: boolean };

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
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [language, setLanguage] = useState<Language>("python");

  // roundIdx is always within [0,4]; the guard satisfies the tuple's `| undefined`
  // under noUncheckedIndexedAccess.
  const round = puzzle.rounds[roundIdx];
  if (!round) return null;

  // Hoisted so the nested closures below don't lose the non-undefined narrowing.
  const correctIndex = round.correctIndex;
  const isLast = roundIdx === puzzle.rounds.length - 1;
  const current = answers[roundIdx] ?? null;
  const correctCount = answers.filter((a) => a?.correct).length;
  // Stages filled in the code panel: completed rounds, plus the current one once revealed.
  const completedThroughRound = done ? 5 : revealed ? roundIdx + 1 : roundIdx;
  // The player's OWN pick per round (null until answered) — drives the diff panel.
  const picks = answers.map((a) => (a ? a.chosen : null));

  function choose(i: 0 | 1 | 2 | 3) {
    if (revealed) return;
    const correct = i === correctIndex;
    setAnswers((prev) => {
      const next = [...prev];
      next[roundIdx] = { chosen: i, correct };
      return next;
    });
    setRevealed(true);
  }

  function advance() {
    if (isLast) {
      setDone(true);
      return;
    }
    setRoundIdx((i) => i + 1);
    setRevealed(false);
  }

  function reset() {
    setRoundIdx(0);
    setAnswers(EMPTY);
    setRevealed(false);
    setDone(false);
  }

  function squareClass(idx: number): string {
    const ans = answers[idx];
    if (ans && (idx < roundIdx || done)) {
      return ans.correct ? "bg-green-600 text-white" : "bg-red-600 text-white";
    }
    if (idx === roundIdx && !done) {
      return "bg-blue-100 text-blue-900 ring-2 ring-blue-500";
    }
    return "bg-gray-200 text-gray-500";
  }

  function optionClass(i: number): string {
    if (!revealed) {
      return "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5";
    }
    const chosen = current?.chosen === i;
    const isCorrect = i === correctIndex;
    if (chosen && isCorrect) return "bg-green-600 text-white border border-green-600";
    if (chosen && !isCorrect) return "bg-red-600 text-white border border-red-600";
    if (!chosen && isCorrect) return "border-2 border-green-500 ring-2 ring-green-500";
    return "bg-gray-100 text-gray-500 border border-gray-200";
  }

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

      {/* [B2] Construction panel — the player's own picks land here, growing one stage
          per round. Diff mode (all current puzzles) shows green/red picks git-diff style;
          canonical-only is the preserved session-004 fallback. */}
      {!done && (
        <section className="mt-6">
          <div className="mb-2 flex justify-end">
            <LangToggle language={language} setLanguage={setLanguage} />
          </div>
          {puzzle.constructionMode === "diff" ? (
            <DiffPanel
              puzzle={puzzle}
              picks={picks}
              revealedThrough={completedThroughRound}
              language={language}
            />
          ) : (
            <ConstructedCode
              puzzle={puzzle}
              completedThroughRound={completedThroughRound}
              language={language}
            />
          )}
        </section>
      )}

      {/* [C] Active round */}
      {!done && (
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
                disabled={revealed}
                onClick={() => choose(i as 0 | 1 | 2 | 3)}
                className={`w-full rounded-lg px-4 py-3 text-left text-sm transition-colors ${optionClass(i)} ${revealed ? "cursor-default" : "cursor-pointer"}`}
              >
                {opt.conceptLabel}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* [D] Reveal — the correct fragment's code + rationale, plus your pick if wrong */}
      {!done && revealed && (
        <section className="mt-4 rounded-lg border border-black/10 bg-black/[0.03] p-4 dark:border-white/15 dark:bg-white/5">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
            {current?.correct ? "Correct" : "Not quite"}
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
            {round.options[correctIndex].fragments[language]}
          </pre>
          <p className="mt-2 text-sm leading-relaxed opacity-90">
            {round.options[correctIndex].rationale}
          </p>
          {!current?.correct && current && (
            <p className="mt-3 border-t border-black/10 pt-3 text-sm leading-relaxed opacity-75 dark:border-white/15">
              <span className="font-semibold">You picked “{round.options[current.chosen].conceptLabel}”:</span>{" "}
              {round.options[current.chosen].rationale}
            </p>
          )}
        </section>
      )}

      {/* [E] Next */}
      {!done && revealed && (
        <button
          type="button"
          onClick={advance}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
        >
          {isLast ? "See results →" : "Next round →"}
        </button>
      )}

      {/* [F] Summary — score, the solution you built, and a per-stage breakdown */}
      {done && (
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
      )}
    </main>
  );
}
