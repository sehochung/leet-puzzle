// Client-only Pyodide runner — a thin message-passing client over a Web Worker
// (public/pyodide-worker.js) that owns all Python execution off the main thread.
// The exported async API is unchanged (runTraced / runSnippet / preloadPyodide), so
// callers (Player) are untouched; preloadPyodide gains an OPTIONAL progress callback
// for the loading UI. The pure helpers (norm / equalUnordered / parseEntryPoint) stay
// here because the main thread uses them for pass/fail comparison and entry parsing.
//
// Comparison mirrors scripts/test-puzzles.mjs exactly: order-insensitive at every level
// (deep-sort lists, sort dict keys, string-compare) so "any order" outputs match — see norm().
//
// CSP note: the worker's importScripts() and Pyodide itself fetch the runtime from
// jsdelivr and compile WASM, so the page CSP must allow worker-src 'self', script-src
// 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net, and connect-src https://cdn.jsdelivr.net
// (see middleware.ts).

export type TestRunResult = {
  index: number;
  input: unknown;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  error: string | null; // captured Python traceback, or null on success
};

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

// Coarse boot stages the worker reports, for the loading indicator.
export type LoadStage = "downloading" | "booting" | "ready";

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
export function equalUnordered(a: unknown, b: unknown): boolean {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// Parses the single function name from a Python solution (`def solve(...)`). Every puzzle uses
// `solve` today; parsing keeps any future single-function puzzle working without a schema field.
export function parseEntryPoint(python: string): string {
  return python.match(/def\s+(\w+)\s*\(/)?.[1] ?? "solve";
}

// ---------------------------------------------------------------------------
// Worker client. The worker is a singleton, lazily spawned on first use; requests are
// matched to responses by a monotonic id. An onerror (worker crash) rejects everything
// in flight and drops the instance so the next call respawns.

type WorkerResponse =
  | { type: "progress"; stage: LoadStage }
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const progressListeners = new Set<(stage: LoadStage) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker("/pyodide-worker.js");
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if ("type" in msg && msg.type === "progress") {
      progressListeners.forEach((l) => l(msg.stage));
      return;
    }
    if (!("id" in msg)) return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  };
  w.onerror = () => {
    const err = new Error("Pyodide worker crashed");
    pending.forEach((p) => p.reject(err));
    pending.clear();
    worker = null; // respawn on the next call
  };
  worker = w;
  return w;
}

function request<T>(type: "preload" | "trace" | "snippet", payload: unknown): Promise<T> {
  const id = nextId++;
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, type, payload });
  });
}

let preloadPromise: Promise<void> | null = null;

// Warms the runtime when a puzzle opens (lazy per site, eager per puzzle), so the first
// per-round trace doesn't pay the ~1s boot. Callers handle/ignore the rejection — a failed
// preload just means the first real run pays the load (the worker clears its cache on failure).
// onProgress receives the worker's coarse boot stages and is auto-detached once boot settles.
export function preloadPyodide(onProgress?: (stage: LoadStage) => void): Promise<void> {
  if (onProgress) progressListeners.add(onProgress);
  if (!preloadPromise) {
    preloadPromise = request<null>("preload", {}).then(() => undefined);
    preloadPromise.catch(() => {
      preloadPromise = null; // allow a later retry
    });
  }
  const detach = () => {
    if (onProgress) progressListeners.delete(onProgress);
  };
  return preloadPromise.then(detach, (e) => {
    detach();
    throw e;
  });
}

// Runs one traced execution. Same never-throw contract as before: compile errors, load
// failures, and step-budget aborts all come back as a result (the worker self-contains
// those); this catch only fires on a worker crash / protocol error.
export async function runTraced(
  code: string,
  entryPoint: string,
  input: unknown,
  stubReturnLine: number, // -1 when the output round is filled (all returns are real)
): Promise<TraceRunResult> {
  try {
    return await request<TraceRunResult>("trace", {
      code,
      entry: entryPoint,
      inputJson: JSON.stringify(input),
      stubLine: stubReturnLine,
    });
  } catch (e) {
    return {
      state: {},
      steps: [],
      stepsTruncated: 0,
      returned: false,
      returnValue: null,
      returnJson: null,
      stopped: "error",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Runs a self-contained bridge "Show me" snippet, capturing printed lines. Deliberately
// separate from runTraced: the snippet demonstrates the WRONG choice in isolation and prints
// its own evidence — it never touches the constructed program. Same never-throw contract.
export async function runSnippet(code: string): Promise<{ output: string; error: string | null }> {
  try {
    return await request<{ output: string; error: string | null }>("snippet", { code });
  } catch (e) {
    return { output: "", error: e instanceof Error ? e.message : String(e) };
  }
}
