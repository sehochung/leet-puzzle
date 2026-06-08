import type { Language, Puzzle, Stage } from "./puzzle";

export const COMMENT: Record<Language, string> = { python: "#", java: "//" };

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

// Returns the scaffold line that holds {{stage}} with the marker replaced by `fragment`,
// split into physical lines. The scaffold is the single source of truth for per-stage
// indentation AND the output `return …;` wrapper, so callers never hardcode them; a
// multi-line fragment yields multiple rows (all part of the same pick). The () => form
// inserts the fragment literally so a `$` inside it is never read as a replacement token
// (mirrors renderScaffold / buildConstructedCode). Used by the diff panel and end-screen.
export function scaffoldStageLines(
  puzzle: Puzzle,
  stage: Stage,
  fragment: string,
  language: Language,
): string[] {
  const marker = `{{${stage}}}`;
  const line = puzzle.scaffolds[language].split("\n").find((l) => l.includes(marker));
  if (line === undefined) return fragment.split("\n"); // defensive; validator guarantees the marker
  return line.replace(marker, () => fragment).split("\n");
}
