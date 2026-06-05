// Build-time puzzle gate. Runs without a TS toolchain (plain Node ESM, no deps)
// so `prebuild` can fail the build on a malformed puzzle. Invariants mirror
// lib/parse-puzzle.ts — keep the two in sync.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROUND_TYPE_ORDER = ["principle", "approach", "complexity", "ambiguity", "edgeCase"];
const PUZZLES_DIR = join(process.cwd(), "puzzles");

function assert(cond, path, msg) {
  if (!cond) throw new Error(`${path}: ${msg}`);
}
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function str(v, path) {
  assert(typeof v === "string", path, `expected string, got ${typeof v}`);
  return v;
}
function num(v, path) {
  assert(typeof v === "number" && Number.isFinite(v), path, `expected finite number, got ${typeof v}`);
  return v;
}

function validateRound(v, i) {
  const path = `rounds[${i}]`;
  assert(isRecord(v), path, "expected object");
  assert(v.type === ROUND_TYPE_ORDER[i], `${path}.type`, `expected "${ROUND_TYPE_ORDER[i]}", got "${v.type}"`);
  assert(Array.isArray(v.options), `${path}.options`, "expected array");
  assert(v.options.length === 4, `${path}.options`, `expected length 4, got ${v.options.length}`);
  v.options.forEach((o, j) => str(o, `${path}.options[${j}]`));
  const ci = num(v.correctIndex, `${path}.correctIndex`);
  assert(Number.isInteger(ci) && ci >= 0 && ci <= 3, `${path}.correctIndex`, `expected integer in [0,3], got ${ci}`);
  num(v.id, `${path}.id`);
  num(v.timeLimitSeconds, `${path}.timeLimitSeconds`);
  str(v.question, `${path}.question`);
  str(v.explanation, `${path}.explanation`);
}

function validatePuzzle(data) {
  assert(isRecord(data), "puzzle", "expected object");
  assert(/^puzzle-\d{3}$/.test(str(data.id, "id")), "id", `expected /^puzzle-\\d{3}$/, got "${data.id}"`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(str(data.date, "date")), "date", `expected YYYY-MM-DD, got "${data.date}"`);
  str(data.title, "title");
  assert(isRecord(data.baseProblem), "baseProblem", "expected object");
  str(data.baseProblem.statement, "baseProblem.statement");
  assert(isRecord(data.baseProblem.example), "baseProblem.example", "expected object");
  assert("input" in data.baseProblem.example, "baseProblem.example.input", "missing");
  assert("output" in data.baseProblem.example, "baseProblem.example.output", "missing");
  assert(Array.isArray(data.rounds), "rounds", "expected array");
  assert(data.rounds.length === 5, "rounds", `expected length 5, got ${data.rounds.length}`);
  data.rounds.forEach(validateRound);
}

const files = (await readdir(PUZZLES_DIR)).filter((f) => f.endsWith(".json")).sort();
let failures = 0;
for (const file of files) {
  try {
    validatePuzzle(JSON.parse(await readFile(join(PUZZLES_DIR, file), "utf8")));
    console.log(`PASS ${file}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${file}: ${err.message}`);
  }
}
console.log(`\n${files.length - failures}/${files.length} passed`);
process.exit(failures > 0 ? 1 : 0);
