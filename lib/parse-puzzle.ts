import {
  type Option,
  type Puzzle,
  type Round,
  type TestCase,
  STAGE_ORDER,
} from "./puzzle";

// Throws Error with a field-path message on any invalid input, e.g.
//   "rounds[2].options[1].fragments.java: expected non-empty string"
// No external libs — just assertions. The single runtime gate that lets the rest
// of the app trust the Puzzle type. Shape invariants mirror
// scripts/validate-puzzles.mjs — keep the two in sync.

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

function nonEmptyStr(v: unknown, path: string): string {
  const s = str(v, path);
  assert(s.length > 0, path, "expected non-empty string");
  return s;
}

function num(v: unknown, path: string): number {
  assert(
    typeof v === "number" && Number.isFinite(v),
    path,
    `expected finite number, got ${typeof v}`,
  );
  return v;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

function parseScaffold(v: unknown, path: string): string {
  const s = nonEmptyStr(v, path);
  for (const stage of STAGE_ORDER) {
    const n = countOccurrences(s, `{{${stage}}}`);
    assert(n === 1, path, `expected exactly one {{${stage}}} marker, got ${n}`);
  }
  return s;
}

function parseOption(v: unknown, path: string): Option {
  assert(isRecord(v), path, "expected object");
  assert(isRecord(v.fragments), `${path}.fragments`, "expected object");
  return {
    conceptLabel: nonEmptyStr(v.conceptLabel, `${path}.conceptLabel`),
    fragments: {
      python: nonEmptyStr(v.fragments.python, `${path}.fragments.python`),
      java: nonEmptyStr(v.fragments.java, `${path}.fragments.java`),
    },
    rationale: nonEmptyStr(v.rationale, `${path}.rationale`),
  };
}

function parseRound(v: unknown, i: number): Round {
  const path = `rounds[${i}]`;
  assert(isRecord(v), path, "expected object");

  const expectedStage = STAGE_ORDER[i];
  assert(expectedStage !== undefined, path, `unexpected round index ${i}`);
  const stage = str(v.stage, `${path}.stage`);
  assert(stage === expectedStage, `${path}.stage`, `expected "${expectedStage}", got "${stage}"`);

  const id = num(v.id, `${path}.id`);
  assert(id === i + 1, `${path}.id`, `expected ${i + 1}, got ${id}`);

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
    id,
    stage: expectedStage,
    question: nonEmptyStr(v.question, `${path}.question`),
    options: [
      parseOption(options[0], `${path}.options[0]`),
      parseOption(options[1], `${path}.options[1]`),
      parseOption(options[2], `${path}.options[2]`),
      parseOption(options[3], `${path}.options[3]`),
    ],
    correctIndex: ci,
  };
}

function parseTest(v: unknown, i: number): TestCase {
  const path = `tests[${i}]`;
  assert(isRecord(v), path, "expected object");
  assert("input" in v, `${path}.input`, "missing");
  assert("expected" in v, `${path}.expected`, "missing");
  return { input: v.input, expected: v.expected };
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

  const scaffolds = data.scaffolds;
  assert(isRecord(scaffolds), "scaffolds", "expected object");
  const canonical = data.canonicalSolutions;
  assert(isRecord(canonical), "canonicalSolutions", "expected object");

  const tests = data.tests;
  assert(Array.isArray(tests), "tests", "expected array");
  assert(tests.length > 0, "tests", "expected non-empty array");

  const rounds = data.rounds;
  assert(Array.isArray(rounds), "rounds", "expected array");
  assert(rounds.length === 5, "rounds", `expected length 5, got ${rounds.length}`);

  return {
    id,
    date,
    title: nonEmptyStr(data.title, "title"),
    baseProblem: {
      statement: nonEmptyStr(bp.statement, "baseProblem.statement"),
      example: { input: example.input, output: example.output },
    },
    scaffolds: {
      python: parseScaffold(scaffolds.python, "scaffolds.python"),
      java: parseScaffold(scaffolds.java, "scaffolds.java"),
    },
    canonicalSolutions: {
      python: nonEmptyStr(canonical.python, "canonicalSolutions.python"),
      java: nonEmptyStr(canonical.java, "canonicalSolutions.java"),
    },
    tests: tests.map((t, i) => parseTest(t, i)),
    rounds: [
      parseRound(rounds[0], 0),
      parseRound(rounds[1], 1),
      parseRound(rounds[2], 2),
      parseRound(rounds[3], 3),
      parseRound(rounds[4], 4),
    ],
  };
}
