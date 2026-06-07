// Build-time puzzle gate. Pure Node ESM, no deps and no external runtimes, so it
// runs in `prebuild` (and on Vercel) without Python/Java installed. Checks two
// things: (1) shape invariants — mirror lib/parse-puzzle.ts, keep in sync; and
// (2) compose-correctness — rendering each scaffold with the 5 *correct* fragments
// must reproduce canonicalSolutions byte-for-byte. Behavioural execution of the
// canonical solution lives in test-puzzles.mjs (needs the language runtimes).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { STAGES, renderScaffold } from "./render-canonical.mjs";

const STAGE_ORDER = STAGES;
const LANGUAGES = ["python", "java"];
const PUZZLES_DIR = join(process.cwd(), "puzzles");

function assert(cond, path, msg) {
  if (!cond) throw new Error(`${path}: ${msg}`);
}
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function str(v, path) {
  assert(typeof v === "string", path, `expected string, got ${typeof v}`);
  return v;
}
function nonEmptyStr(v, path) {
  const s = str(v, path);
  assert(s.length > 0, path, "expected non-empty string");
  return s;
}
function num(v, path) {
  assert(typeof v === "number" && Number.isFinite(v), path, `expected finite number, got ${typeof v}`);
  return v;
}
function countOccurrences(haystack, needle) {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}
function validateScaffold(v, path) {
  const s = nonEmptyStr(v, path);
  for (const stage of STAGE_ORDER) {
    const n = countOccurrences(s, `{{${stage}}}`);
    assert(n === 1, path, `expected exactly one {{${stage}}} marker, got ${n}`);
  }
}
function validateOption(v, path) {
  assert(isRecord(v), path, "expected object");
  nonEmptyStr(v.conceptLabel, `${path}.conceptLabel`);
  assert(isRecord(v.fragments), `${path}.fragments`, "expected object");
  for (const lang of LANGUAGES) nonEmptyStr(v.fragments[lang], `${path}.fragments.${lang}`);
  nonEmptyStr(v.rationale, `${path}.rationale`);
}
function validateRound(v, i) {
  const path = `rounds[${i}]`;
  assert(isRecord(v), path, "expected object");
  assert(v.id === i + 1, `${path}.id`, `expected ${i + 1}, got ${v.id}`);
  assert(v.stage === STAGE_ORDER[i], `${path}.stage`, `expected "${STAGE_ORDER[i]}", got "${v.stage}"`);
  nonEmptyStr(v.question, `${path}.question`);
  assert(Array.isArray(v.options), `${path}.options`, "expected array");
  assert(v.options.length === 4, `${path}.options`, `expected length 4, got ${v.options.length}`);
  v.options.forEach((o, j) => validateOption(o, `${path}.options[${j}]`));
  const ci = num(v.correctIndex, `${path}.correctIndex`);
  assert(Number.isInteger(ci) && ci >= 0 && ci <= 3, `${path}.correctIndex`, `expected integer in [0,3], got ${ci}`);
}
function validateShape(data) {
  assert(isRecord(data), "puzzle", "expected object");
  assert(/^puzzle-\d{3}$/.test(str(data.id, "id")), "id", `expected /^puzzle-\\d{3}$/, got "${data.id}"`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(str(data.date, "date")), "date", `expected YYYY-MM-DD, got "${data.date}"`);
  nonEmptyStr(data.title, "title");
  assert(isRecord(data.baseProblem), "baseProblem", "expected object");
  nonEmptyStr(data.baseProblem.statement, "baseProblem.statement");
  assert(isRecord(data.baseProblem.example), "baseProblem.example", "expected object");
  assert("input" in data.baseProblem.example, "baseProblem.example.input", "missing");
  assert("output" in data.baseProblem.example, "baseProblem.example.output", "missing");
  assert(isRecord(data.scaffolds), "scaffolds", "expected object");
  for (const lang of LANGUAGES) validateScaffold(data.scaffolds[lang], `scaffolds.${lang}`);
  assert(isRecord(data.canonicalSolutions), "canonicalSolutions", "expected object");
  for (const lang of LANGUAGES) nonEmptyStr(data.canonicalSolutions[lang], `canonicalSolutions.${lang}`);
  assert(Array.isArray(data.tests), "tests", "expected array");
  assert(data.tests.length > 0, "tests", "expected non-empty array");
  data.tests.forEach((t, i) => {
    assert(isRecord(t), `tests[${i}]`, "expected object");
    assert("input" in t, `tests[${i}].input`, "missing");
    assert("expected" in t, `tests[${i}].expected`, "missing");
  });
  assert(Array.isArray(data.rounds), "rounds", "expected array");
  assert(data.rounds.length === 5, "rounds", `expected length 5, got ${data.rounds.length}`);
  data.rounds.forEach(validateRound);
}
// Rendering the scaffold with the 5 correct fragments must reproduce the canonical
// solution exactly. This is the "the correct path actually builds the stated answer"
// typo-catcher — only the canonical (correct) picks are checked; distractors are not.
function validateCompose(data) {
  for (const lang of LANGUAGES) {
    const fragmentsByStage = {};
    data.rounds.forEach((r, i) => {
      fragmentsByStage[STAGE_ORDER[i]] = r.options[r.correctIndex].fragments[lang];
    });
    const rendered = renderScaffold(data.scaffolds[lang], fragmentsByStage);
    if (rendered !== data.canonicalSolutions[lang]) {
      throw new Error(
        `canonicalSolutions.${lang}: does not match scaffold rendered with the correct fragments.\n` +
        `--- rendered ---\n${rendered}\n--- canonicalSolutions.${lang} ---\n${data.canonicalSolutions[lang]}`
      );
    }
  }
}

const only = process.argv.slice(2); // optional: basenames to restrict to, e.g. puzzle-001
const all = (await readdir(PUZZLES_DIR)).filter((f) => /^puzzle-\d{3}\.json$/.test(f)).sort();
const files = only.length
  ? all.filter((f) => only.some((o) => f === o || f === `${o}.json`))
  : all;

let failures = 0;
for (const file of files) {
  try {
    const data = JSON.parse(await readFile(join(PUZZLES_DIR, file), "utf8"));
    validateShape(data);
    validateCompose(data);
    console.log(`PASS ${file}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${file}: ${err.message}`);
  }
}
console.log(`\n${files.length - failures}/${files.length} passed`);
process.exit(failures > 0 ? 1 : 0);
