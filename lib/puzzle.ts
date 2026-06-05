// Canonical puzzle schema. Tuple types enforce exactly-4-options and
// exactly-5-rounds at the type level — no runtime length checks needed once a
// value is typed as Puzzle. See parse-puzzle.ts for the runtime gate.

export type RoundType =
  | "principle"
  | "approach"
  | "complexity"
  | "ambiguity"
  | "edgeCase";

// Rounds always appear in this fixed order; index i must have type ORDER[i].
export const ROUND_TYPE_ORDER: readonly RoundType[] = [
  "principle",
  "approach",
  "complexity",
  "ambiguity",
  "edgeCase",
] as const;

export type Round = {
  id: number;
  type: RoundType;
  timeLimitSeconds: number;
  question: string;
  options: readonly [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
};

export type Puzzle = {
  id: string;
  date: string;
  title: string;
  baseProblem: {
    statement: string;
    // input/output shapes vary per puzzle; the renderer adapts.
    example: { input: unknown; output: unknown };
  };
  rounds: readonly [Round, Round, Round, Round, Round];
};
