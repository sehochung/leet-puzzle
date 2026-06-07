import type { Language, Puzzle } from "./puzzle";

const COMMENT: Record<Language, string> = { python: "#", java: "//" };

// Renders the language scaffold with the correct fragment for each completed
// stage and a placeholder comment for the rest. completedThroughRound is 0..5;
// at 5 the result equals canonicalSolutions[language] (the compose invariant,
// enforced by scripts/validate-puzzles.mjs). The () => replacement form inserts
// the fragment literally so a `$` inside it is never read as a replacement token.
export function buildConstructedCode(
  puzzle: Puzzle,
  completedThroughRound: number,
  language: Language,
): string {
  let out = puzzle.scaffolds[language];
  puzzle.rounds.forEach((r, i) => {
    const replacement =
      i < completedThroughRound
        ? r.options[r.correctIndex].fragments[language]
        : `${COMMENT[language]} … ${r.stage} — round ${i + 1}`;
    out = out.replace(`{{${r.stage}}}`, () => replacement);
  });
  return out;
}
