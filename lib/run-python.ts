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

// Warms the runtime when a puzzle opens (lazy per site, eager per puzzle), so the first
// per-round trace doesn't pay the ~1s boot. Callers handle/ignore the rejection — a failed
// preload just means the first real run pays the load (getPyodide clears its cache on failure).
export function preloadPyodide(): Promise<void> {
  return getPyodide().then(() => undefined);
}

// ---------------------------------------------------------------------------
// Traced execution (debugger panel): runs the entry fn on ONE input under
// sys.settrace, capturing STATE (frame locals as reprs), TRACE (per-line steps
// with the variables each line changed), and OUTPUT (the return value — with the
// partial program's stubbed `return None` line excluded so "(not yet returned)"
// is accurate even for puzzles that return early from inside the loop).
//
// The tracer doubles as the infinite-loop guard: partial programs can genuinely
// not terminate (e.g. `while lo < hi:` locked while the `lo += 1; hi -= 1`
// update round is still a `pass` stub), and Pyodide runs on the main thread, so
// a step budget raises out of the loop instead of freezing the tab.

export type TraceStep = {
  line: number; // 1-based line in the executed program
  source: string; // that line's source text (trimmed)
  changed: Record<string, string>; // var -> repr of variables this line changed
};

export type TraceRunResult = {
  state: Record<string, string>; // final frame locals (reprs), params included
  steps: TraceStep[];
  stepsTruncated: number; // line events beyond the recording cap
  returned: boolean; // a REAL (non-stub) return executed
  returnValue: string | null; // repr of the returned value
  returnJson: string | null; // JSON of the returned value when serializable (pass/fail compare)
  stopped: "completed" | "step-budget" | "error";
  error: string | null; // captured traceback when stopped === "error"
};

// Defines __trace_run(code, entry, input_json, stub_line) -> result JSON. Notes:
//  - exec into a fresh namespace per run, so reruns never see stale globals.
//  - the global trace hook snapshots params on the entry frame's "call" event, so
//    they don't show up as "changed by" the first body line.
//  - a line's effects only become visible in locals at the NEXT trace event, so
//    each event attributes the locals-diff to the PREVIOUSLY recorded step.
//  - CPython fires a "return" event even on exceptional exit (arg None), so the
//    returned/returnValue fields are only trusted when the run completed.
const TRACE_HARNESS = `
import sys, json, traceback

def __trace_run(__code, __entry, __input_json, __stub_line):
    __result = {
        "state": {}, "steps": [], "stepsTruncated": 0,
        "returned": False, "returnValue": None, "returnJson": None,
        "stopped": "completed", "error": None,
    }
    __ns = {}
    try:
        __input = json.loads(__input_json)
        exec(compile(__code, "<solution>", "exec"), __ns)
        __fn = __ns[__entry]
    except Exception:
        __result["stopped"] = "error"
        __result["error"] = traceback.format_exc()
        return json.dumps(__result)

    __steps = []
    __budget = [8000]
    __CAP = 200
    __prev = [{}]
    __ret = [None, False, -1]  # value, fired, lineno

    def __snapshot(__frame):
        __snap = {}
        for __k, __v in __frame.f_locals.items():
            try:
                __r = repr(__v)
            except Exception:
                __r = "<unrepresentable>"
            if len(__r) > 200:
                __r = __r[:200] + "\\u2026"
            __snap[__k] = __r
        return __snap

    def __local_trace(__frame, __event, __arg):
        __budget[0] -= 1
        if __budget[0] <= 0:
            raise RuntimeError("__IIT_STEP_BUDGET__")
        if __event not in ("line", "return"):
            return __local_trace
        __snap = __snapshot(__frame)
        if __steps and __result["stepsTruncated"] == 0:
            __chg = {__k: __r for __k, __r in __snap.items() if __prev[0].get(__k) != __r}
            if __chg:
                __steps[-1]["changed"] = __chg
        __prev[0] = __snap
        if __event == "line":
            if len(__steps) < __CAP:
                __steps.append({"line": __frame.f_lineno, "changed": {}})
            else:
                __result["stepsTruncated"] += 1
        else:
            __result["state"] = __snap
            __ret[0] = __arg
            __ret[1] = True
            __ret[2] = __frame.f_lineno
        return __local_trace

    def __global_trace(__frame, __event, __arg):
        if __frame.f_code.co_name == __entry:
            __prev[0] = __snapshot(__frame)
            return __local_trace
        return None

    sys.settrace(__global_trace)
    try:
        __fn(__input)
    except RuntimeError as __e:
        if "__IIT_STEP_BUDGET__" in str(__e):
            __result["stopped"] = "step-budget"
        else:
            __result["stopped"] = "error"
            __result["error"] = traceback.format_exc()
    except Exception:
        __result["stopped"] = "error"
        __result["error"] = traceback.format_exc()
    finally:
        sys.settrace(None)

    if not __result["state"]:
        __result["state"] = __prev[0]
    __result["steps"] = __steps
    if __result["stopped"] == "completed" and __ret[1] and not (__stub_line >= 0 and __ret[2] == __stub_line):
        __result["returned"] = True
        __r = repr(__ret[0])
        if len(__r) > 500:
            __r = __r[:500] + "\\u2026"
        __result["returnValue"] = __r
        try:
            __result["returnJson"] = json.dumps(__ret[0])
        except Exception:
            __result["returnJson"] = None
    return json.dumps(__result)
`;

type RawTraceResult = Omit<TraceRunResult, "steps"> & {
  steps: Array<{ line: number; changed: Record<string, string> }>;
};

// Runs one traced execution. Same never-throw contract as runSolution: compile
// errors, load failures, and step-budget aborts all come back as a result.
export async function runTraced(
  code: string,
  entryPoint: string,
  input: unknown,
  stubReturnLine: number, // -1 when the output round is filled (all returns are real)
): Promise<TraceRunResult> {
  const fail = (error: string): TraceRunResult => ({
    state: {},
    steps: [],
    stepsTruncated: 0,
    returned: false,
    returnValue: null,
    returnJson: null,
    stopped: "error",
    error,
  });
  try {
    const pyodide = await getPyodide();
    await pyodide.runPythonAsync(TRACE_HARNESS);
    const traceRun = pyodide.globals.get("__trace_run");
    if (typeof traceRun !== "function") return fail("trace harness was not defined");
    const raw = (traceRun as (c: string, e: string, i: string, s: number) => unknown)(
      code,
      entryPoint,
      JSON.stringify(input),
      stubReturnLine,
    );
    const parsed = JSON.parse(String(raw)) as RawTraceResult;
    const lines = code.split("\n");
    return {
      ...parsed,
      steps: parsed.steps.map((s) => ({ ...s, source: (lines[s.line - 1] ?? "").trim() })),
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
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
