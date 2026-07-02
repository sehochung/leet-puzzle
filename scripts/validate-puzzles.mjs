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
const TOPICS = ["hashmap", "two-pointer", "sliding-window", "binary-search", "dp"];
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
  assert(TOPICS.includes(data.topic), "topic", `expected one of ${TOPICS.join("|")}, got "${data.topic}"`);
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
  validateLightning(data.lightning);
}

// Lightning follow-ups (optional per puzzle; mirror parseLightningArray in
// lib/parse-puzzle.ts). Plain-string options — no fragments, no code to compose.
const LIGHTNING_KINDS = ["complexity", "edge-case", "variation"];
function validateLightning(v) {
  if (v === undefined) return;
  assert(Array.isArray(v), "lightning", "expected array");
  v.forEach((q, i) => {
    const path = `lightning[${i}]`;
    assert(isRecord(q), path, "expected object");
    assert(LIGHTNING_KINDS.includes(q.kind), `${path}.kind`,
      `expected one of ${LIGHTNING_KINDS.join("|")}, got "${q.kind}"`);
    nonEmptyStr(q.question, `${path}.question`);
    assert(Array.isArray(q.options), `${path}.options`, "expected array");
    assert(q.options.length === 4, `${path}.options`, `expected length 4, got ${q.options.length}`);
    q.options.forEach((o, j) => nonEmptyStr(o, `${path}.options[${j}]`));
    const ci = num(q.correctIndex, `${path}.correctIndex`);
    assert(Number.isInteger(ci) && ci >= 0 && ci <= 3, `${path}.correctIndex`,
      `expected integer in [0,3], got ${ci}`);
    nonEmptyStr(q.explanation, `${path}.explanation`);
  });
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

// Mirrors lib/parse-puzzle.ts: "diff" iff every option has non-empty fragments in both
// languages (validateOption already enforces this, so it's always "diff" today). Printed
// per puzzle so the construction mode is explicit in the build/prebuild output.
function constructionMode(data) {
  const allFilled = data.rounds.every((r) =>
    r.options.every((o) => o.fragments.python.length > 0 && o.fragments.java.length > 0));
  return allFilled ? "diff" : "canonical-only";
}

// Bridges (puzzles/bridges.json) shape gate. Companion file, optional — a missing
// file is fine (the app falls back to generic bridge text). Checked here so a typo'd
// round key or a bridge pointing at the CORRECT option fails the build, not the player.
// Word limits mirror the authoring rubric (question < 30 words, follow_up < 25).
function wordCount(s) {
  return s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}
function validateBridges(bridges, puzzlesById) {
  assert(isRecord(bridges), "bridges", "expected object");
  const counts = [];
  for (const [pid, rounds] of Object.entries(bridges)) {
    const puzzle = puzzlesById.get(pid);
    assert(puzzle !== undefined, `bridges.${pid}`, "no such puzzle");
    assert(isRecord(rounds), `bridges.${pid}`, "expected object");
    let n = 0;
    const roundSet = new Set();
    for (const [rkey, opts] of Object.entries(rounds)) {
      const m = rkey.match(/^round-([1-5])$/);
      assert(m !== null, `bridges.${pid}.${rkey}`, "expected round-1..round-5");
      const round = puzzle.rounds[Number(m[1]) - 1];
      assert(isRecord(opts), `bridges.${pid}.${rkey}`, "expected object");
      for (const [okey, bridge] of Object.entries(opts)) {
        const path = `bridges.${pid}.${rkey}.${okey}`;
        const oi = Number(okey);
        assert(/^[0-3]$/.test(okey), path, "expected option index 0..3");
        assert(oi !== round.correctIndex, path, "bridge targets the CORRECT option");
        assert(isRecord(bridge), path, "expected object");
        const q = nonEmptyStr(bridge.question, `${path}.question`);
        const t = nonEmptyStr(bridge.trace_setup, `${path}.trace_setup`);
        const f = nonEmptyStr(bridge.follow_up, `${path}.follow_up`);
        assert(wordCount(q) <= 30, `${path}.question`, `over 30 words (${wordCount(q)})`);
        assert(wordCount(f) <= 25, `${path}.follow_up`, `over 25 words (${wordCount(f)})`);
        assert(t.split("\n").length <= 20, `${path}.trace_setup`, "over 20 lines");
        n++;
        roundSet.add(rkey);
      }
    }
    counts.push(`${pid}: ${n} bridges across ${roundSet.size} rounds`);
  }
  return counts;
}

// Design puzzles (design-NNN.json) — mirror lib/parse-design.ts, keep in sync.
// No compose/execution check: the "artifact" is the diagram, validated for
// referential integrity (edge endpoints exist, reveal rounds in range) instead.
const DESIGN_STAGES = ["requirements", "api", "data", "scale", "tradeoff"];
const DESIGN_SHAPES = ["box", "store", "actor"];
function validateDesignShape(data) {
  assert(isRecord(data), "design", "expected object");
  assert(/^design-\d{3}$/.test(str(data.id, "id")), "id", `expected /^design-\\d{3}$/, got "${data.id}"`);
  nonEmptyStr(data.title, "title");
  nonEmptyStr(data.brief, "brief");
  assert(Array.isArray(data.requirements) && data.requirements.length > 0, "requirements", "expected non-empty array");
  data.requirements.forEach((r, i) => nonEmptyStr(r, `requirements[${i}]`));
  assert(Array.isArray(data.rounds), "rounds", "expected array");
  assert(data.rounds.length === 5, "rounds", `expected length 5, got ${data.rounds.length}`);
  data.rounds.forEach((v, i) => {
    const path = `rounds[${i}]`;
    assert(isRecord(v), path, "expected object");
    assert(v.id === i + 1, `${path}.id`, `expected ${i + 1}, got ${v.id}`);
    assert(v.stage === DESIGN_STAGES[i], `${path}.stage`, `expected "${DESIGN_STAGES[i]}", got "${v.stage}"`);
    nonEmptyStr(v.question, `${path}.question`);
    assert(Array.isArray(v.options) && v.options.length === 4, `${path}.options`, "expected 4 options");
    v.options.forEach((o, j) => {
      assert(isRecord(o), `${path}.options[${j}]`, "expected object");
      nonEmptyStr(o.conceptLabel, `${path}.options[${j}].conceptLabel`);
      nonEmptyStr(o.rationale, `${path}.options[${j}].rationale`);
    });
    const ci = num(v.correctIndex, `${path}.correctIndex`);
    assert(Number.isInteger(ci) && ci >= 0 && ci <= 3, `${path}.correctIndex`, `expected integer in [0,3], got ${ci}`);
  });
  assert(isRecord(data.diagram), "diagram", "expected object");
  assert(Array.isArray(data.diagram.nodes) && data.diagram.nodes.length > 0, "diagram.nodes", "expected non-empty array");
  const ids = new Set();
  data.diagram.nodes.forEach((n, i) => {
    const path = `diagram.nodes[${i}]`;
    assert(isRecord(n), path, "expected object");
    const id = nonEmptyStr(n.id, `${path}.id`);
    assert(!ids.has(id), `${path}.id`, `duplicate node id "${id}"`);
    ids.add(id);
    nonEmptyStr(n.label, `${path}.label`);
    assert(DESIGN_SHAPES.includes(n.shape), `${path}.shape`, `expected ${DESIGN_SHAPES.join("|")}, got "${n.shape}"`);
    for (const k of ["x", "y", "w", "h"]) num(n[k], `${path}.${k}`);
    const ar = num(n.appearsAtRound, `${path}.appearsAtRound`);
    assert(Number.isInteger(ar) && ar >= 0 && ar <= 5, `${path}.appearsAtRound`, `expected integer in [0,5], got ${ar}`);
  });
  assert(Array.isArray(data.diagram.edges), "diagram.edges", "expected array");
  data.diagram.edges.forEach((e, i) => {
    const path = `diagram.edges[${i}]`;
    assert(isRecord(e), path, "expected object");
    assert(ids.has(e.from), `${path}.from`, `no node with id "${e.from}"`);
    assert(ids.has(e.to), `${path}.to`, `no node with id "${e.to}"`);
    const ar = num(e.appearsAtRound, `${path}.appearsAtRound`);
    assert(Number.isInteger(ar) && ar >= 0 && ar <= 5, `${path}.appearsAtRound`, `expected integer in [0,5], got ${ar}`);
  });
  assert(Array.isArray(data.capacity), "capacity", "expected array");
  data.capacity.forEach((c, i) => {
    const path = `capacity[${i}]`;
    assert(isRecord(c), path, "expected object");
    nonEmptyStr(c.label, `${path}.label`);
    nonEmptyStr(c.value, `${path}.value`);
    const ar = num(c.appearsAtRound, `${path}.appearsAtRound`);
    assert(Number.isInteger(ar) && ar >= 1 && ar <= 5, `${path}.appearsAtRound`, `expected integer in [1,5], got ${ar}`);
  });
}

const only = process.argv.slice(2); // optional: basenames to restrict to, e.g. puzzle-001
const all = (await readdir(PUZZLES_DIR)).filter((f) => /^puzzle-\d{3}\.json$/.test(f)).sort();
const files = only.length
  ? all.filter((f) => only.some((o) => f === o || f === `${o}.json`))
  : all;
const allDesigns = (await readdir(PUZZLES_DIR)).filter((f) => /^design-\d{3}\.json$/.test(f)).sort();
const designFiles = only.length
  ? allDesigns.filter((f) => only.some((o) => f === o || f === `${o}.json`))
  : allDesigns;

let failures = 0;
const puzzlesById = new Map();
for (const file of files) {
  try {
    const data = JSON.parse(await readFile(join(PUZZLES_DIR, file), "utf8"));
    validateShape(data);
    validateCompose(data);
    puzzlesById.set(data.id, data);
    const nLightning = Array.isArray(data.lightning) ? data.lightning.length : 0;
    console.log(`PASS ${file} (${constructionMode(data)} mode, ${nLightning} lightning)`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${file}: ${err.message}`);
  }
}

let designFailures = 0;
for (const file of designFiles) {
  try {
    const data = JSON.parse(await readFile(join(PUZZLES_DIR, file), "utf8"));
    validateDesignShape(data);
    console.log(`PASS ${file} (design, ${data.diagram.nodes.length} nodes / ${data.diagram.edges.length} edges)`);
  } catch (err) {
    designFailures++;
    console.error(`FAIL ${file}: ${err.message}`);
  }
}

// Bridges are validated only on full runs (a filtered run may not have loaded the
// puzzles the bridges reference).
let bridgeFailures = 0;
if (only.length === 0) {
  try {
    const raw = await readFile(join(PUZZLES_DIR, "bridges.json"), "utf8").catch(() => null);
    if (raw !== null) {
      for (const line of validateBridges(JSON.parse(raw), puzzlesById)) {
        console.log(`PASS bridges ${line}`);
      }
    }
  } catch (err) {
    bridgeFailures++;
    console.error(`FAIL bridges.json: ${err.message}`);
  }
}

console.log(
  `\n${files.length - failures}/${files.length} puzzles, ${designFiles.length - designFailures}/${designFiles.length} designs passed`,
);
process.exit(failures + bridgeFailures + designFailures > 0 ? 1 : 0);
