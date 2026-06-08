// Client-only Pyodide runner. Executes the CONSTRUCTED Python solution (always a composition of
// our authored fragments, never free user input) against a puzzle's test cases in a WASM sandbox.
// Pyodide is lazy-loaded once from the jsdelivr CDN (pinned) and cached; later runs reuse it.
//
// Comparison mirrors scripts/test-puzzles.mjs exactly: order-insensitive at every level
// (deep-sort lists, sort dict keys, string-compare) so "any order" outputs match — see norm().
import type { TestCase } from "./puzzle";

// Pinned: latest stable as of 2026-05. `pyodide.js` + the WASM live under this base.
const PYODIDE_VERSION = "v0.29.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

export type TestRunResult = {
  index: number;
  input: unknown;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  error: string | null; // captured Python traceback, or null on success
};

// Minimal surface of the Pyodide runtime we use — avoids depending on the pyodide npm types.
interface PyodideInterface {
  runPythonAsync(code: string): Promise<unknown>;
  globals: { get(name: string): unknown };
}
type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideInterface>;
// `loadPyodide` is attached to window by the injected CDN script; this typed view avoids `any`.
type PyodideWindow = Window & typeof globalThis & { loadPyodide?: LoadPyodide };

// Defines __run_all(tests_json, entry): calls the entry fn on each test's input, capturing either
// the (JSON-serializable) return value or the traceback — never throwing — and returns JSON.
const HARNESS = `
import json, traceback
def __run_all(__tests_json, __entry):
    __fn = globals()[__entry]
    __tests = json.loads(__tests_json)
    __out = []
    for __t in __tests:
        try:
            __got = __fn(__t["input"])
            json.dumps(__got)  # force serialization failures into this test's error, not the batch
            __out.append({"actual": __got, "error": None})
        except Exception:
            __out.append({"actual": None, "error": traceback.format_exc()})
    return json.dumps(__out)
`;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load the Pyodide script from the CDN"));
    document.head.appendChild(s);
  });
}

// Singleton: first call injects the script + boots Pyodide; the promise is cached for reuse.
// On failure the cache is cleared so a later run can retry rather than reusing a rejected promise.
let pyodidePromise: Promise<PyodideInterface> | null = null;
function getPyodide(): Promise<PyodideInterface> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    const w = window as PyodideWindow;
    if (!w.loadPyodide) await injectScript(`${PYODIDE_BASE}pyodide.js`);
    if (!w.loadPyodide) throw new Error("Pyodide failed to initialize");
    return w.loadPyodide({ indexURL: PYODIDE_BASE });
  })();
  pyodidePromise.catch(() => {
    pyodidePromise = null;
  });
  return pyodidePromise;
}

// Recursive deep-sort: arrays sort by their elements' canonical JSON, objects sort their keys —
// the JS twin of test-puzzles.mjs's __norm. Two values are "equal" iff their normalized JSON matches.
function norm(x: unknown): unknown {
  if (Array.isArray(x)) {
    return x.map(norm).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  }
  if (x !== null && typeof x === "object") {
    const o: Record<string, unknown> = {};
    const src = x as Record<string, unknown>;
    for (const k of Object.keys(src).sort()) o[k] = norm(src[k]);
    return o;
  }
  return x;
}
function equalUnordered(a: unknown, b: unknown): boolean {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// Parses the single function name from a Python solution (`def solve(...)`). Every puzzle uses
// `solve` today; parsing keeps any future single-function puzzle working without a schema field.
export function parseEntryPoint(python: string): string {
  return python.match(/def\s+(\w+)\s*\(/)?.[1] ?? "solve";
}

// Runs the constructed solution against every test. Always resolves: a syntax error in the
// composed code, a Pyodide load failure, or a per-test exception all surface as error results,
// never a thrown exception that would crash the UI.
export async function runSolution(
  constructedCode: string,
  entryPoint: string,
  tests: readonly TestCase[],
): Promise<TestRunResult[]> {
  try {
    const pyodide = await getPyodide();
    await pyodide.runPythonAsync(`${constructedCode}\n\n${HARNESS}`);
    const runAll = pyodide.globals.get("__run_all");
    if (typeof runAll !== "function") throw new Error("run harness was not defined");
    const raw = (runAll as (t: string, e: string) => unknown)(JSON.stringify(tests), entryPoint);
    const parsed = JSON.parse(String(raw)) as Array<{ actual: unknown; error: string | null }>;
    return tests.map((t, i) => {
      const r = parsed[i] ?? { actual: null, error: "no result returned" };
      const passed = r.error === null && equalUnordered(r.actual, t.expected);
      return { index: i, input: t.input, expected: t.expected, actual: r.actual, passed, error: r.error };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return tests.map((t, i) => ({
      index: i,
      input: t.input,
      expected: t.expected,
      actual: null,
      passed: false,
      error: msg,
    }));
  }
}
