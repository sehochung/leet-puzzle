import type { Puzzle, Stage } from "./puzzle";

// Composes the RUNNABLE partial program for the debugger panel (Python-only —
// partial execution is a Pyodide feature). Locked rounds get their canonical
// fragment (the build is corrective, so the player's wrong pick never executes
// here); unlocked rounds get a slot-aware stub that keeps every prefix parseable.
// Rounds lock in STAGE_ORDER, so unfilled slots are always a suffix of the
// scaffold — which is why these stubs compose:
//   - state/transform/update: plain `pass` statements.
//   - iterate: a zero-iteration block opener, because the still-stubbed
//     transform/update lines sit at deeper indent below it — a bare `pass`
//     there would be an IndentationError.
//   - output: `None`, because the marker sits inside `return {{output}}` where
//     a statement stub would be a SyntaxError.
const STUBS: Record<Stage, string> = {
  state: "pass",
  iterate: "for _ in []:",
  transform: "pass",
  update: "pass",
  output: "None",
};

// stubReturnLine is the 1-based line number of the scaffold's `return {{output}}`
// line when the output round is still stubbed, or -1 once it's filled. The trace
// harness uses it to tell the stub's `return None` apart from a REAL return (some
// puzzles return early from inside the loop), so "(not yet returned)" is accurate.
export function buildPartialRunnableCode(
  puzzle: Puzzle,
  filledThroughRound: number,
): { code: string; stubReturnLine: number } {
  // Replace every marker except output first, so the output marker's final line
  // number (shifted by any multi-line fragments above it) can be read directly.
  let out = puzzle.scaffolds.python;
  puzzle.rounds.forEach((r, i) => {
    if (r.stage === "output") return;
    const replacement =
      i < filledThroughRound ? r.options[r.correctIndex].fragments.python : STUBS[r.stage];
    // () => form inserts literally so `$` in a fragment is never a replacement token.
    out = out.replace(`{{${r.stage}}}`, () => replacement);
  });

  const outputLine = out.split("\n").findIndex((l) => l.includes("{{output}}")) + 1;
  const outputRound = puzzle.rounds[4];
  const outputFilled = filledThroughRound >= puzzle.rounds.length;
  out = out.replace("{{output}}", () =>
    outputFilled ? outputRound.options[outputRound.correctIndex].fragments.python : STUBS.output,
  );
  return { code: out, stubReturnLine: outputFilled ? -1 : outputLine };
}
