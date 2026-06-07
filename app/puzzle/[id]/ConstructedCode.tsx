"use client";

import { useEffect, useRef, useState } from "react";
import { buildConstructedCode } from "@/lib/build-code";
import type { Language, Puzzle } from "@/lib/puzzle";

// The construction artifact: the canonical solution assembling one stage per
// round. Stages past completedThroughRound show a placeholder comment, so the
// player sees the shape of what they're building before they finish it.
export default function ConstructedCode({
  puzzle,
  completedThroughRound,
  language,
}: {
  puzzle: Puzzle;
  completedThroughRound: number;
  language: Language;
}) {
  const code = buildConstructedCode(puzzle, completedThroughRound, language);
  const filled = Math.min(Math.max(completedThroughRound, 0), 5);

  // Briefly highlight the panel when a new stage fills in.
  const prev = useRef(completedThroughRound);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (completedThroughRound > prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      prev.current = completedThroughRound;
      return () => clearTimeout(t);
    }
    prev.current = completedThroughRound;
  }, [completedThroughRound]);

  return (
    <section
      className={`rounded-lg border p-4 transition-colors duration-700 ${
        flash
          ? "border-yellow-400 bg-yellow-50 dark:border-yellow-500/60 dark:bg-yellow-500/10"
          : "border-black/10 bg-black/[0.03] dark:border-white/15 dark:bg-white/5"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Solution so far</p>
        <p className="text-xs tabular-nums opacity-50">{filled}/5 stages</p>
      </div>
      <pre className="overflow-x-auto rounded bg-black/5 p-3 text-xs leading-relaxed dark:bg-white/10">
        <code>{code}</code>
      </pre>
    </section>
  );
}
