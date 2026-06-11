"use client";

import type { ReactNode } from "react";
import type { Language, Puzzle } from "@/lib/puzzle";
import { COMMENT, scaffoldStageLines } from "@/lib/build-code";
import DiffLine from "./DiffLine";

// The code editor during the corrective build. Rounds lock strictly in order, so
// filledThroughRound is a prefix length: every locked round renders the CANONICAL
// fragment (a wrong pick is corrected — the algorithm always builds right; the
// player's actual pick lives in the option reveal and the end-screen review).
// Unlocked rounds show a muted "___" slot under their stage-label comment. Line
// numbers run over filled rows only.
export default function DiffPanel({
  puzzle,
  filledThroughRound,
  language,
}: {
  puzzle: Puzzle;
  filledThroughRound: number;
  language: Language;
}) {
  const rows: ReactNode[] = [];
  let lineNo = 0;

  puzzle.rounds.forEach((round, r) => {
    const { stage } = round;
    rows.push(
      <DiffLine key={`c${r}`} tone="comment" text={`${COMMENT[language]} ${stage}`} />,
    );

    if (r >= filledThroughRound) {
      scaffoldStageLines(puzzle, stage, "___", language).forEach((line, k) =>
        rows.push(<DiffLine key={`p${r}-${k}`} tone="placeholder" text={line} />),
      );
      return;
    }

    const canonical = round.options[round.correctIndex].fragments[language];
    scaffoldStageLines(puzzle, stage, canonical, language).forEach((line, k) => {
      lineNo += 1;
      rows.push(<DiffLine key={`f${r}-${k}`} tone="code" lineNo={lineNo} text={line} />);
    });
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-black/[0.02] py-2 dark:border-white/15 dark:bg-white/[0.03]">
      {rows}
    </div>
  );
}
