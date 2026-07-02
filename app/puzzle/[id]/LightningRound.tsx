"use client";

import { useEffect, useRef, useState } from "react";
import type { LightningKind, LightningQuestion } from "@/lib/puzzle";

// The interviewer's follow-up phase: quick questions about the solution the
// player just built, each on a 20-second clock. First click locks (same rule as
// the build rounds); running out of time locks as a miss with the answer shown.
// The countdown drives urgency — that's the game feel — but a timeout still
// teaches: the explanation always appears.

const TIME_MS = 20_000;
const TICK_MS = 100;

const KIND_LABEL: Record<LightningKind, string> = {
  complexity: "Complexity",
  "edge-case": "Edge case",
  variation: "Follow-up",
};

type Locked = { chosen: number | null; correct: boolean }; // chosen null = timed out

export default function LightningRound({
  questions,
  onDone,
}: {
  questions: readonly LightningQuestion[];
  onDone: (score: number, total: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState<Locked | null>(null);
  const [remaining, setRemaining] = useState(TIME_MS);
  const [score, setScore] = useState(0);
  // The deadline is a timestamp so a dropped interval tick can't stretch the clock.
  const deadline = useRef(0);

  const q = questions[idx];

  // (Re)arm the clock whenever a new question becomes active.
  useEffect(() => {
    if (!q) return;
    deadline.current = Date.now() + TIME_MS;
    setRemaining(TIME_MS);
  }, [idx, q]);

  useEffect(() => {
    if (!q || locked) return;
    const t = setInterval(() => {
      const left = deadline.current - Date.now();
      if (left <= 0) {
        setRemaining(0);
        setLocked({ chosen: null, correct: false }); // time's up — a miss, with the reveal
      } else {
        setRemaining(left);
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [idx, locked, q]);

  if (!q) return null;
  const correctIndex = q.correctIndex;
  const isLastQ = idx === questions.length - 1;

  function choose(i: number) {
    if (locked) return;
    const correct = i === correctIndex;
    setLocked({ chosen: i, correct });
    if (correct) setScore((s) => s + 1);
  }

  function next() {
    if (!locked) return;
    if (isLastQ) {
      onDone(score, questions.length);
    } else {
      setLocked(null);
      setIdx((i) => i + 1);
    }
  }

  function optionClass(i: number): string {
    if (!locked) {
      return "cursor-pointer border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5";
    }
    if (i === correctIndex) {
      return "border-2 border-green-600 bg-green-50 text-green-900 dark:bg-green-500/15 dark:text-white";
    }
    if (locked.chosen === i) {
      return "border-2 border-red-600 bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-white";
    }
    return "border border-black/15 opacity-40 dark:border-white/20";
  }

  const frac = remaining / TIME_MS;

  return (
    <section className="mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
          ⚡ Lightning · {idx + 1} of {questions.length}
        </p>
        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          {KIND_LABEL[q.kind]}
        </span>
      </div>

      {/* Countdown bar — freezes where it stood once the question locks. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{
            width: `${Math.round(frac * 100)}%`,
            transition: locked ? "none" : `width ${TICK_MS}ms linear`,
          }}
        />
      </div>
      {!locked && (
        <p className="mt-1 text-right text-xs tabular-nums opacity-50">
          {Math.ceil(remaining / 1000)}s
        </p>
      )}
      {locked && locked.chosen === null && (
        <p className="mt-1 text-right text-xs font-semibold text-red-600">Time's up</p>
      )}

      <h2 className="mt-3 text-lg font-semibold">{q.question}</h2>
      <div className="mt-4 flex flex-col gap-3">
        {q.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={locked !== null}
            onClick={() => choose(i)}
            className={`w-full rounded-lg px-4 py-3 text-left text-sm transition-colors ${optionClass(i)}`}
          >
            {opt}
          </button>
        ))}
      </div>

      {locked && (
        <>
          <div
            className={`mt-4 rounded-md border p-3 text-sm leading-relaxed ${
              locked.correct
                ? "border-green-600/40 bg-green-50 dark:bg-green-500/10"
                : "border-red-600/40 bg-red-50 dark:bg-red-500/10"
            }`}
          >
            {q.explanation}
          </div>
          <button
            type="button"
            onClick={next}
            className="mt-4 w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {isLastQ ? "Finish →" : "Next question →"}
          </button>
        </>
      )}
    </section>
  );
}
