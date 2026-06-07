// Renders a scaffold by replacing each {{stage}} marker with the chosen fragment
// for that stage. Used by validate-puzzles.mjs to verify that scaffold + the
// correctIndex fragments compose into canonicalSolutions exactly, and to build
// the single-stage distractor swaps for the syntax check.

export const STAGES = ["state", "iterate", "transform", "update", "output"];

export function renderScaffold(scaffold, fragmentsByStage) {
  for (const stage of STAGES) {
    if (!(stage in fragmentsByStage)) {
      throw new Error(`renderScaffold: missing fragment for stage "${stage}"`);
    }
  }
  let out = scaffold;
  for (const stage of STAGES) {
    const marker = `{{${stage}}}`;
    if (!out.includes(marker)) {
      throw new Error(`renderScaffold: scaffold missing placeholder ${marker}`);
    }
    // Function replacement so a fragment containing $-sequences is inserted literally.
    out = out.replace(marker, () => fragmentsByStage[stage]);
    if (out.includes(marker)) {
      throw new Error(`renderScaffold: duplicate placeholder ${marker}`);
    }
  }
  const stray = out.match(/\{\{[^}]+\}\}/);
  if (stray) {
    throw new Error(`renderScaffold: unmatched placeholder ${stray[0]}`);
  }
  return out;
}
