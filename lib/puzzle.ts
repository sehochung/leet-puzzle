// Puzzle schema for the code-construction mechanic. The player fills 5 named
// slots (one per Stage, in STAGE_ORDER) of a language-specific scaffold by
// picking one Option per round; all-correct picks compose into
// canonicalSolutions exactly. Tuple types pin exactly-4-options and
// exactly-5-rounds at the type level. See parse-puzzle.ts for the runtime gate.

export type Stage = "state" | "iterate" | "transform" | "update" | "output";

// Every puzzle's rounds appear in this fixed order; round i fills STAGE_ORDER[i].
export const STAGE_ORDER: readonly Stage[] = [
  "state",
  "iterate",
  "transform",
  "update",
  "output",
] as const;

export type Language = "python" | "java";

export type Topic =
  | "hashmap"
  | "two-pointer"
  | "sliding-window"
  | "binary-search"
  | "dp";

export type Option = {
  conceptLabel: string; // shown on the button, language-neutral
  fragments: { python: string; java: string }; // both required, no nulls
  rationale: string; // shown on reveal, language-neutral
};

export type Round = {
  id: number; // 1..5
  stage: Stage; // must equal STAGE_ORDER[id-1]
  question: string;
  options: readonly [Option, Option, Option, Option];
  correctIndex: 0 | 1 | 2 | 3;
};

export type TestCase = {
  input: unknown; // shape is per-puzzle
  expected: unknown;
};

export type Puzzle = {
  id: string; // /^puzzle-\d{3}$/
  date: string; // YYYY-MM-DD
  title: string;
  topic: Topic; // problem family; drives the list-page Topic column
  baseProblem: {
    statement: string;
    example: { input: unknown; output: unknown };
  };
  scaffolds: { python: string; java: string }; // templates with {{stage}} markers
  canonicalSolutions: { python: string; java: string }; // what all-correct picks produce
  tests: readonly TestCase[]; // >=1; validator runs canonical against these
  rounds: readonly [Round, Round, Round, Round, Round];
  // Derived (not in JSON): "diff" when every option carries non-empty fragments in
  // both languages, so the player's actual pick can be shown green/red per round;
  // "canonical-only" is the fallback (session-004 panel). Always "diff" for current
  // data — the parser already requires non-empty fragments — but kept as a real
  // branch for any future puzzle authored without distractor fragments.
  constructionMode: "diff" | "canonical-only";
};
