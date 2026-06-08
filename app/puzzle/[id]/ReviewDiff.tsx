"use client";

import { useState, type ReactNode } from "react";
import type { Language, Puzzle } from "@/lib/puzzle";
import { COMMENT, scaffoldStageLines } from "@/lib/build-code";
import DiffLine from "./DiffLine";

// End-screen PR-review diff. For each round: a stage-label comment, then the player's pick
// vs the canonical — exactly like a GitHub change request. A correct round shows one green
// "+" block; a wrong round shows the red "-" pick immediately above the green "+" canonical
// (no gap). Every code line is clickable and toggles the rationale for that pick (why wrong /
// why right). Green "+" lines carry the running line numbers of the final canonical solution;
// red picks aren't part of it, so they get no number.
function Rationale({ tone, text }: { tone: "add" | "remove"; text: string }) {
  const accent = tone === "add" ? "border-green-500/60" : "border-red-500/60";
  return (
    <div
      className={`border-l-2 ${accent} bg-black/[0.03] py-2 pr-4 pl-10 text-xs leading-relaxed opacity-80 dark:bg-white/[0.05]`}
    >
      <span className="font-semibold">
        {tone === "add" ? "Why this is right: " : "Why this is wrong: "}
      </span>
      {text}
    </div>
  );
}

export default function ReviewDiff({
  puzzle,
  picks,
  language,
  initialOpen,
}: {
  puzzle: Puzzle;
  picks: Array<0 | 1 | 2 | 3 | null>;
  language: Language;
  initialOpen?: ReadonlySet<string>; // pre-expanded rationale keys ("r:pick" / "r:canonical")
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(initialOpen ?? new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows: ReactNode[] = [];
  let lineNo = 0;

  puzzle.rounds.forEach((round, r) => {
    const { stage, correctIndex } = round;
    rows.push(<DiffLine key={`c${r}`} tone="comment" text={`${COMMENT[language]} ${stage}`} />);

    const pick = picks[r];
    const wrong = pick !== null && pick !== undefined && pick !== correctIndex;

    // Red "-": the player's wrong pick (annotation; not numbered, not in the final solution).
    if (wrong) {
      const key = `${r}:pick`;
      scaffoldStageLines(puzzle, stage, round.options[pick].fragments[language], language).forEach(
        (line, k) =>
          rows.push(
            <DiffLine key={`w${r}-${k}`} tone="remove" sym="-" text={line} onClick={() => toggle(key)} />,
          ),
      );
      if (open.has(key))
        rows.push(<Rationale key={`wr${r}`} tone="remove" text={round.options[pick].rationale} />);
    }

    // Green "+": the canonical (also the player's pick when correct).
    const key = `${r}:canonical`;
    scaffoldStageLines(puzzle, stage, round.options[correctIndex].fragments[language], language).forEach(
      (line, k) => {
        lineNo += 1;
        rows.push(
          <DiffLine
            key={`g${r}-${k}`}
            tone="add"
            sym="+"
            lineNo={lineNo}
            text={line}
            onClick={() => toggle(key)}
          />,
        );
      },
    );
    if (open.has(key))
      rows.push(<Rationale key={`gr${r}`} tone="add" text={round.options[correctIndex].rationale} />);
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-black/[0.02] py-2 dark:border-white/15 dark:bg-white/[0.03]">
      {rows}
    </div>
  );
}
