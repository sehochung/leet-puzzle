// Off-main-thread Pyodide runner (classic Web Worker). Owns ALL Python execution
// for the puzzle player, so a partial program's settrace loop or step-budget abort
// runs off the UI thread and never freezes the tab. Served as a static asset from
// /public (deliberately NOT bundled by Next), which keeps it a CLASSIC worker so
// importScripts() can pull Pyodide from the CDN — module workers can't importScripts.
//
// Protocol (postMessage):
//   in : { id, type: "preload" | "trace" | "snippet", payload }
//   out: { id, ok: true, result } | { id, ok: false, error: string }
//   out (unsolicited, no id): { type: "progress", stage: "downloading"|"booting"|"ready" }
//
// runTraced/runSnippet preserve the never-throw contract: compile errors, load
// failures, and step-budget aborts all come back as a normal result, not a rejection.

// Pinned: latest stable as of 2026-05. `pyodide.js` + the WASM live under this base.
// Keep in sync with the CSP allowance in middleware.ts.
const PYODIDE_VERSION = "v0.29.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

// Defines __trace_run(code, entry, input_json, stub_line) -> result JSON. Notes:
//  - exec into a fresh namespace per run, so reruns never see stale globals.
//  - the global trace hook snapshots params on the entry frame's "call" event, so
//    they don't show up as "changed by" the first body line.
//  - a line's effects only become visible in locals at the NEXT trace event, so
//    each event attributes the locals-diff to the PREVIOUSLY recorded step.
//  - the tracer doubles as the infinite-loop guard: a partial program can genuinely
//    not terminate (e.g. `while lo < hi:` locked while its update round is a stub),
//    and the 8k step budget raises out of the loop instead of spinning forever.
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

let pyodide = null;
let bootPromise = null;

function progress(stage) {
  self.postMessage({ type: "progress", stage });
}

// Lazy one-time boot: download + init Pyodide, then define the trace harness. Cached;
// on failure the cache is cleared so a later request can retry rather than reuse a
// rejected promise. preload is just an eager call to this.
function boot() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    progress("downloading");
    importScripts(`${PYODIDE_BASE}pyodide.js`);
    progress("booting");
    pyodide = await self.loadPyodide({ indexURL: PYODIDE_BASE });
    await pyodide.runPythonAsync(TRACE_HARNESS);
    progress("ready");
  })();
  bootPromise.catch(() => {
    bootPromise = null;
  });
  return bootPromise;
}

async function traceRun(code, entry, inputJson, stubLine) {
  const fail = (error) => ({
    state: {}, steps: [], stepsTruncated: 0, returned: false,
    returnValue: null, returnJson: null, stopped: "error", error,
  });
  try {
    await boot();
    const traceFn = pyodide.globals.get("__trace_run");
    if (typeof traceFn !== "function") return fail("trace harness was not defined");
    const raw = traceFn(code, entry, inputJson, stubLine);
    const parsed = JSON.parse(String(raw));
    const lines = code.split("\n");
    // Attach each step's source line here (the worker holds `code`); STATE/OUTPUT
    // come straight from the harness JSON.
    parsed.steps = parsed.steps.map((s) => ({ ...s, source: (lines[s.line - 1] ?? "").trim() }));
    return parsed;
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

async function runSnippet(code) {
  const out = [];
  try {
    await boot();
    pyodide.setStdout({ batched: (line) => out.push(line) });
    try {
      await pyodide.runPythonAsync(code);
    } finally {
      pyodide.setStdout();
    }
    return { output: out.join("\n"), error: null };
  } catch (e) {
    return { output: out.join("\n"), error: e instanceof Error ? e.message : String(e) };
  }
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    let result = null;
    if (type === "preload") {
      await boot();
    } else if (type === "trace") {
      result = await traceRun(payload.code, payload.entry, payload.inputJson, payload.stubLine);
    } else if (type === "snippet") {
      result = await runSnippet(payload.code);
    } else {
      throw new Error(`unknown message type: ${type}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    // Only reached when boot() itself rejects (preload): trace/snippet self-contain errors.
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
