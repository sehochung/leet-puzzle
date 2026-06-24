"use client";

import type { Language } from "@/lib/puzzle";
import type { LoadStage, TraceRunResult } from "@/lib/run-python";

// What the debugger panel is showing. "trace" is a partial/full run of the
// constructed code; "snippet" is captured stdout (the bridge "Show me" path,
// which runs a self-contained demonstration, never the constructed program).
export type PanelView =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "trace"; trace: TraceRunResult }
  | { kind: "snippet"; output: string; error: string | null };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-black/10 px-3 py-2 first:border-t-0 dark:border-white/10">
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-50">{title}</p>
      <div className="mt-1 font-mono text-xs leading-relaxed">{children}</div>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="opacity-45">{children}</p>;
}

// Compact traceback: everything dimmed except the last line (the actual error), in red.
function ErrorBlock({ error }: { error: string }) {
  const lines = error.split("\n").filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1] ?? error;
  const rest = lines.slice(0, -1);
  return (
    <div className="overflow-x-auto">
      {rest.length > 0 && <pre className="text-[11px] opacity-50">{rest.join("\n")}</pre>}
      <pre className="font-semibold text-red-700 dark:text-red-400">{last}</pre>
    </div>
  );
}

// The debugger-style panel beside the code editor: STATE (variables in scope),
// TRACE (what each executed line did), OUTPUT (the return value, or why there
// isn't one). Sparse early-round content — empty trace, "(not yet returned)" —
// is the normal state of a partial program, not an error.
export default function DebuggerPanel({
  view,
  language,
  runtimeReady,
  loadStage = null,
}: {
  view: PanelView;
  language: Language;
  runtimeReady: boolean;
  loadStage?: LoadStage | null;
}) {
  const frame =
    "rounded-lg border border-black/10 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.03]";

  if (language === "java") {
    return (
      <div className={`${frame} p-4`}>
        <p className="text-sm leading-relaxed opacity-70">
          Trace visualization is currently Python-only. Switch to Python to see your code
          execute.
        </p>
      </div>
    );
  }

  if (view.kind === "idle" || view.kind === "loading") {
    const loadingText =
      loadStage === "downloading"
        ? "Downloading Python runtime…"
        : loadStage === "booting"
          ? "Starting Python runtime…"
          : "Loading Python runtime…";
    const note =
      view.kind === "loading"
        ? runtimeReady
          ? "Running…"
          : loadingText
        : runtimeReady
          ? "Lock in your first pick to run the code so far."
          : loadingText;
    return (
      <div className={`${frame} p-4`}>
        <p className="text-sm opacity-60">{note}</p>
      </div>
    );
  }

  if (view.kind === "snippet") {
    return (
      <div className={`${frame} py-1`}>
        <Section title="Output">
          {view.output.length > 0 ? (
            <pre className="overflow-x-auto whitespace-pre">{view.output}</pre>
          ) : (
            <Muted>(no output)</Muted>
          )}
          {view.error !== null && (
            <div className="mt-2">
              <ErrorBlock error={view.error} />
            </div>
          )}
        </Section>
      </div>
    );
  }

  const { trace } = view;
  const stateEntries = Object.entries(trace.state);

  return (
    <div className={`${frame} py-1`}>
      <Section title="State">
        {stateEntries.length > 0 ? (
          <div className="overflow-x-auto">
            {stateEntries.map(([name, value]) => (
              <p key={name} className="whitespace-pre">
                <span className="font-semibold">{name}</span>
                <span className="opacity-50"> = </span>
                {value}
              </p>
            ))}
          </div>
        ) : (
          <Muted>(no variables yet)</Muted>
        )}
      </Section>

      <Section title="Trace">
        {trace.steps.length > 0 ? (
          <div className="max-h-72 overflow-y-auto overflow-x-auto">
            {trace.steps.map((step, i) => (
              <div key={i} className="whitespace-pre">
                <p>
                  <span className="select-none opacity-40">{String(step.line).padStart(3)} </span>
                  {step.source}
                </p>
                {Object.entries(step.changed).map(([name, value]) => (
                  <p key={name} className="pl-10 opacity-70">
                    {name} <span className="opacity-50">←</span> {value}
                  </p>
                ))}
              </div>
            ))}
            {trace.stepsTruncated > 0 && (
              <Muted>… {trace.stepsTruncated} more steps not shown</Muted>
            )}
          </div>
        ) : (
          <Muted>(ran; nothing to trace yet)</Muted>
        )}
      </Section>

      <Section title="Output">
        {trace.stopped === "error" && trace.error !== null ? (
          <ErrorBlock error={trace.error} />
        ) : trace.stopped === "step-budget" ? (
          <p className="text-red-700 dark:text-red-400">
            (stopped after 8,000 steps — the loop can&apos;t finish until a later round fills
            in)
          </p>
        ) : trace.returned && trace.returnValue !== null ? (
          <pre className="overflow-x-auto whitespace-pre">{trace.returnValue}</pre>
        ) : (
          <Muted>(not yet returned)</Muted>
        )}
      </Section>
    </div>
  );
}
