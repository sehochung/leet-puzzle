"use client";

import type { ReactNode } from "react";
import type { Language, Puzzle } from "@/lib/puzzle";
import { COMMENT, scaffoldStageLines } from "@/lib/build-code";
import DiffLine from "./DiffLine";

// The construction artifact, git-diff style. During the blind build (`neutral`) each answered
// round drops the player's OWN pick into the panel as a plain numbered "context" line — no
// +/- , no green/red — so correctness stays hidden until the end-screen reveal. Outside neutral
// mode a pick shows green "+" if correct, red "-" if wrong. Unanswered rounds show a muted "___"
// slot under their stage-label comment. Line numbers run over filled rows only.
export default function DiffPanel({
  puzzle,
  picks,
  revealedThrough,
  language,
  neutral = false,
}: {
  puzzle: Puzzle;
  picks: Array<0 | 1 | 2 | 3 | null>;
  revealedThrough: number;
  language: Language;
  neutral?: boolean;
}) {
  const rows: ReactNode[] = [];
  let lineNo = 0;

  puzzle.rounds.forEach((round, r) => {
    const { stage } = round;
    rows.push(
      <DiffLine key={`c${r}`} tone="comment" text={`${COMMENT[language]} ${stage}`} />,
    );

    const pick = picks[r];
    if (r >= revealedThrough || pick === null || pick === undefined) {
      scaffoldStageLines(puzzle, stage, "___", language).forEach((line, k) =>
        rows.push(<DiffLine key={`p${r}-${k}`} tone="placeholder" text={line} />),
      );
      return;
    }

    const correct = pick === round.correctIndex;
    const tone = neutral ? "neutral" : correct ? "add" : "remove";
    const sym = neutral ? undefined : correct ? "+" : "-";
    scaffoldStageLines(puzzle, stage, round.options[pick].fragments[language], language).forEach(
      (line, k) => {
        lineNo += 1;
        rows.push(
          <DiffLine key={`f${r}-${k}`} tone={tone} sym={sym} lineNo={lineNo} text={line} />,
        );
      },
    );
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-black/[0.02] py-2 dark:border-white/15 dark:bg-white/[0.03]">
      {rows}
    </div>
  );
}
