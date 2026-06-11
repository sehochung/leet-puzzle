// Behavioural puzzle gate — NOT part of the build (needs Python + a JDK installed).
// Run locally while authoring: `npm run test-puzzles [puzzle-001 ...]`.
//
// Per the project's "only canonical must run" rule, this executes ONLY the
// canonical solution, never the distractors (their failures are the pedagogy):
//   - Python: run canonicalSolutions.python's solve(input) against every test,
//     comparing order-insensitively (deep-sorted) to expected.
//   - Java:   compile canonicalSolutions.java with javac (syntax/type catch).
// Shape + compose-correctness are checked separately by validate-puzzles.mjs.
import { readdir, readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PUZZLES_DIR = join(process.cwd(), "puzzles");

function resolvePython() {
  for (const cmd of ["python", "python3"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  return null;
}
const SKIP_JAVA = process.argv.includes("--skip-java") || !!process.env.IIT_SKIP_JAVA;
const PYTHON = resolvePython();
const HAVE_JAVAC = !SKIP_JAVA && spawnSync("javac", ["-version"], { encoding: "utf8" }).status === 0;

// Deep-sort + json harness so "any order" outputs compare structurally. solve()
// receives the test's `input` as its single argument.
function pythonProgram(canonical, testsJsonPath) {
  return `${canonical}

import json, sys
with open(${JSON.stringify(testsJsonPath.replace(/\\/g, "/"))}, encoding="utf-8") as __f:
    __TESTS = json.load(__f)

def __norm(x):
    if isinstance(x, list):
        return sorted((__norm(e) for e in x), key=lambda v: json.dumps(v, sort_keys=True))
    if isinstance(x, dict):
        return {k: __norm(v) for k, v in x.items()}
    return x

__fails = 0
for __i, __t in enumerate(__TESTS):
    __got = solve(__t["input"])
    if json.dumps(__norm(__got), sort_keys=True) != json.dumps(__norm(__t["expected"]), sort_keys=True):
        __fails += 1
        print("  python test %d FAIL: got %r, expected %r" % (__i, __got, __t["expected"]))
sys.exit(1 if __fails else 0)
`;
}

async function runOne(file) {
  const data = JSON.parse(await readFile(join(PUZZLES_DIR, file), "utf8"));
  const dir = await mkdtemp(join(tmpdir(), "iit-"));
  const problems = [];
  try {
    // Python: execute against tests.
    if (PYTHON) {
      const testsPath = join(dir, "tests.json");
      const progPath = join(dir, "prog.py");
      await writeFile(testsPath, JSON.stringify(data.tests), "utf8");
      await writeFile(progPath, pythonProgram(data.canonicalSolutions.python, testsPath), "utf8");
      const r = spawnSync(PYTHON, [progPath], { encoding: "utf8" });
      if (r.status !== 0) problems.push((r.stdout || "") + (r.stderr || "") || "python: non-zero exit");
    } else {
      problems.push("python: SKIPPED (no interpreter found)");
    }
    // Java: compile only.
    if (HAVE_JAVAC) {
      const javaPath = join(dir, "Solution.java");
      await writeFile(javaPath, data.canonicalSolutions.java, "utf8");
      const r = spawnSync("javac", ["-d", dir, javaPath], { encoding: "utf8" });
      if (r.status !== 0) problems.push("java compile:\n" + (r.stderr || r.stdout || "non-zero exit"));
    } else {
      problems.push("java: SKIPPED (no javac found)");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return problems;
}

// Bridge trace_setup gate: every snippet must run to completion (intentional errors
// are caught-and-printed inside the snippet) and produce stdout — the demonstration IS
// the stdout. This doesn't violate the "only canonical runs" rule: bridges are authored
// demonstrations, not distractor gating. `--show-bridges` dumps each snippet's output
// for content review.
async function runBridges(showOutput) {
  const raw = await readFile(join(PUZZLES_DIR, "bridges.json"), "utf8").catch(() => null);
  if (raw === null || !PYTHON) return 0;
  let failures = 0;
  const dir = await mkdtemp(join(tmpdir(), "iit-bridges-"));
  try {
    for (const [pid, rounds] of Object.entries(JSON.parse(raw))) {
      for (const [rkey, opts] of Object.entries(rounds)) {
        for (const [okey, bridge] of Object.entries(opts)) {
          const name = `${pid} ${rkey} option ${okey}`;
          const p = join(dir, "bridge.py");
          await writeFile(p, bridge.trace_setup, "utf8");
          const r = spawnSync(PYTHON, [p], { encoding: "utf8", timeout: 15000 });
          if (r.status !== 0 || !(r.stdout || "").trim()) {
            failures++;
            console.error(`FAIL bridge ${name}:\n${r.stderr || r.stdout || "no output"}`);
          } else if (showOutput) {
            console.log(`--- ${name} ---\n${r.stdout.trimEnd()}`);
          } else {
            console.log(`PASS bridge ${name}`);
          }
        }
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return failures;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const all = (await readdir(PUZZLES_DIR)).filter((f) => /^puzzle-\d{3}\.json$/.test(f)).sort();
const files = only.length ? all.filter((f) => only.some((o) => f === o || f === `${o}.json`)) : all;

if (!PYTHON) console.warn("! python not found — Python execution skipped");
if (!HAVE_JAVAC) console.warn("! javac not found — Java compilation skipped");

let failures = 0;
for (const file of files) {
  const problems = await runOne(file);
  const hard = problems.filter((p) => !p.includes("SKIPPED"));
  if (hard.length === 0) {
    console.log(`PASS ${file}${problems.length ? "  (" + problems.length + " skipped)" : ""}`);
  } else {
    failures++;
    console.error(`FAIL ${file}:\n${hard.join("\n")}`);
  }
}
const bridgeFailures = only.length ? 0 : await runBridges(process.argv.includes("--show-bridges"));
console.log(`\n${files.length - failures}/${files.length} passed${bridgeFailures ? `; ${bridgeFailures} bridge snippets failed` : ""}`);
process.exit(failures + bridgeFailures > 0 ? 1 : 0);
