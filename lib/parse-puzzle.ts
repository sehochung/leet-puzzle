import { type Puzzle, type Round, ROUND_TYPE_ORDER } from "./puzzle";

// Throws Error with a field-path message on any invalid input, e.g.
//   "rounds[2].options: expected length 4, got 3"
// No external libs — just assertions. This is the single runtime gate that
// lets the rest of the app trust the Puzzle type.

function assert(cond: boolean, path: string, msg: string): asserts cond {
  if (!cond) throw new Error(`${path}: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, path: string): string {
  assert(typeof v === "string", path, `expected string, got ${typeof v}`);
  return v;
}

function num(v: unknown, path: string): number {
  assert(
    typeof v === "number" && Number.isFinite(v),
    path,
    `expected finite number, got ${typeof v}`,
  );
  return v;
}

function parseRound(v: unknown, i: number): Round {
  const path = `rounds[${i}]`;
  assert(isRecord(v), path, "expected object");

  const expectedType = ROUND_TYPE_ORDER[i];
  assert(expectedType !== undefined, path, `unexpected round index ${i}`);
  const type = str(v.type, `${path}.type`);
  assert(type === expectedType, `${path}.type`, `expected "${expectedType}", got "${type}"`);

  const options = v.options;
  assert(Array.isArray(options), `${path}.options`, "expected array");
  assert(options.length === 4, `${path}.options`, `expected length 4, got ${options.length}`);

  const ci = num(v.correctIndex, `${path}.correctIndex`);
  assert(
    ci === 0 || ci === 1 || ci === 2 || ci === 3,
    `${path}.correctIndex`,
    `expected integer in [0,3], got ${ci}`,
  );

  return {
    id: num(v.id, `${path}.id`),
    type: expectedType,
    timeLimitSeconds: num(v.timeLimitSeconds, `${path}.timeLimitSeconds`),
    question: str(v.question, `${path}.question`),
    options: [
      str(options[0], `${path}.options[0]`),
      str(options[1], `${path}.options[1]`),
      str(options[2], `${path}.options[2]`),
      str(options[3], `${path}.options[3]`),
    ],
    correctIndex: ci,
    explanation: str(v.explanation, `${path}.explanation`),
  };
}

export function parsePuzzle(data: unknown): Puzzle {
  assert(isRecord(data), "puzzle", "expected object");

  const id = str(data.id, "id");
  assert(/^puzzle-\d{3}$/.test(id), "id", `expected /^puzzle-\\d{3}$/, got "${id}"`);
  const date = str(data.date, "date");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), "date", `expected YYYY-MM-DD, got "${date}"`);

  const bp = data.baseProblem;
  assert(isRecord(bp), "baseProblem", "expected object");
  const example = bp.example;
  assert(isRecord(example), "baseProblem.example", "expected object");
  assert("input" in example, "baseProblem.example.input", "missing");
  assert("output" in example, "baseProblem.example.output", "missing");

  const rounds = data.rounds;
  assert(Array.isArray(rounds), "rounds", "expected array");
  assert(rounds.length === 5, "rounds", `expected length 5, got ${rounds.length}`);

  return {
    id,
    date,
    title: str(data.title, "title"),
    baseProblem: {
      statement: str(bp.statement, "baseProblem.statement"),
      example: { input: example.input, output: example.output },
    },
    rounds: [
      parseRound(rounds[0], 0),
      parseRound(rounds[1], 1),
      parseRound(rounds[2], 2),
      parseRound(rounds[3], 3),
      parseRound(rounds[4], 4),
    ],
  };
}
