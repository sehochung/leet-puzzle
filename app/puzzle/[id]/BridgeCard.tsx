"use client";

import { useEffect, useState } from "react";
import type { Bridge } from "@/lib/bridges";
import type { Language } from "@/lib/puzzle";

// The bridging interaction after a wrong pick. Takes the resolved bridge as a PROP
// (null → generic fallback) and never fetches it — the loading layer owns resolution,
// so a future API-backed bridge needs zero changes here. "Show me" hands off to the
// parent (which runs the snippet in the debugger panel); Continue unlocks after the
// trace ran or 5 s passed, so the question at least gets read. Java mode has no
// runnable trace (Pyodide is Python-only): question + follow-up text only.
export default function BridgeCard({
  bridge,
  language,
  onShowMe,
  onContinue,
}: {
  bridge: Bridge | null;
  language: Language;
  onShowMe: () => Promise<void>;
  onContinue: () => void;
}) {
  const [showMe, setShowMe] = useState<"idle" | "running" | "done">("idle");
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const frame =
    "mt-5 rounded-lg border-2 border-red-600/50 bg-red-50/50 p-4 dark:bg-red-500/5";

  if (!bridge) {
    return (
      <section className={frame}>
        <p className="text-sm leading-relaxed">
          That choice won&apos;t produce the shape we need. Let&apos;s keep building.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-4 w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Continue →
        </button>
      </section>
    );
  }

  const followUpVisible = showMe === "done" || (showMe === "idle" && waited);
  const continueEnabled = showMe === "done" || (showMe === "idle" && waited);

  async function handleShowMe() {
    setShowMe("running");
    await onShowMe();
    setShowMe("done");
  }

  return (
    <section className={frame}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Wait — think it through</p>
      <p className="mt-2 text-sm font-medium leading-relaxed">{bridge.question}</p>

      {language === "python" && showMe !== "done" && (
        <button
          type="button"
          onClick={handleShowMe}
          disabled={showMe === "running"}
          className="mt-3 cursor-pointer rounded-lg border border-black/15 px-4 py-2 text-sm font-semibold transition-colors hover:bg-black/5 disabled:cursor-default disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/5"
        >
          {showMe === "running" ? "Running…" : "Show me"}
        </button>
      )}
      {showMe === "done" && (
        <p className="mt-3 text-xs opacity-60">The trace ran in the debugger panel — see what your pick produced.</p>
      )}

      {followUpVisible && (
        <p className="mt-3 border-t border-black/10 pt-3 text-sm leading-relaxed opacity-80 dark:border-white/15">
          {bridge.follow_up}
        </p>
      )}

      <button
        type="button"
        onClick={onContinue}
        disabled={!continueEnabled}
        className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-default disabled:opacity-50 enabled:cursor-pointer"
      >
        Continue →
      </button>
    </section>
  );
}
