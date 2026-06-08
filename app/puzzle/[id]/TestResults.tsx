"use client";

import type { TestRunResult } from "@/lib/run-python";

// The payoff panel: each test case rendered input → expected → your output → pass/fail, in the
// same git-diff palette as DiffLine (#e6ffec / #ffebe9 + dark variants). All data is monospace;
// long values scroll within their card. On error the captured traceback replaces "your output".

const ADD = "bg-[#e6ffec] dark:bg-[rgba(46,160,67,0.15)]";
const REMOVE = "bg-[#ffebe9] dark:bg-[rgba(248,81,73,0.15)]";

function fmt(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

function Field({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-50">{label}</p>
      <pre
        className={`mt-1 overflow-x-auto rounded px-2 py-1.5 font-mono text-xs leading-relaxed ${tint ?? "bg-black/5 dark:bg-white/10"}`}
      >
        {value}
      </pre>
    </div>
  );
}

function Traceback({ error }: { error: string }) {
  const lines = error.split("\n").filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1] ?? error;
  const rest = lines.slice(0, -1);
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-50">Error</p>
      <div className={`mt-1 overflow-x-auto rounded px-2 py-1.5 ${REMOVE}`}>
        {rest.length > 0 && (
          <pre className="font-mono text-[11px] leading-relaxed opacity-60">{rest.join("\n")}</pre>
        )}
        <pre className="font-mono text-xs font-semibold leading-relaxed text-red-700 dark:text-red-400">
          {last}
        </pre>
      </div>
    </div>
  );
}

function Badge({ passed }: { passed: boolean }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-bold ${
        passed ? "bg-green-600 text-white" : "bg-red-600 text-white"
      }`}
    >
      {passed ? "PASS" : "FAIL"}
    </span>
  );
}

export default function TestResults({ results }: { results: TestRunResult[] }) {
  const passedCount = results.filter((r) => r.passed).length;
  const total = results.length;
  const allPassed = passedCount === total;

  return (
    <div>
      <p className="text-sm font-semibold">
        Passed{" "}
        <span className={allPassed ? "text-green-600" : "text-red-600"}>
          {passedCount} of {total}
        </span>{" "}
        tests
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {results.map((r) => (
          <div
            key={r.index}
            className="rounded-lg border border-black/10 p-3 dark:border-white/15"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                Test {r.index + 1}
              </p>
              <Badge passed={r.passed} />
            </div>
            <Field label="Input" value={fmt(r.input)} />
            <Field label="Expected" value={fmt(r.expected)} />
            {r.error !== null ? (
              <Traceback error={r.error} />
            ) : (
              <Field
                label="Your output"
                value={fmt(r.actual)}
                tint={r.passed ? ADD : REMOVE}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
