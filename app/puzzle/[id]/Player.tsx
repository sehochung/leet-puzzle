"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BridgeMap } from "@/lib/bridges";
import type { Language, Puzzle } from "@/lib/puzzle";
import { buildConstructedCode } from "@/lib/build-code";
import { buildPartialRunnableCode } from "@/lib/partial-code";
import { recordCompletion, type Award } from "@/lib/progress";
import { buildShareText, copyToClipboard } from "@/lib/share";
import {
  equalUnordered,
  preloadPyodide,
  runSnippet,
  runTraced,
  parseEntryPoint,
  type LoadStage,
  type TestRunResult,
} from "@/lib/run-python";
import BridgeCard from "./BridgeCard";
import ConstructedCode from "./ConstructedCode";
import DebuggerPanel, { type PanelView } from "./DebuggerPanel";
import DiffPanel from "./DiffPanel";
import ReviewDiff from "./ReviewDiff";
import TestResults from "./TestResults";

type Answer = { chosen: 0 | 1 | 2 | 3; correct: boolean };

// The corrective flow: each pick locks on first click and reveals correctness immediately;
// the editor fills in the CANONICAL fragment for every locked round (wrong picks get
// corrected via the bridge), so the final program is always correct. After round 5:
// "ready" (full solution + Run button), "running" (tests animate one at a time through
// the debugger panel), then "results" (the score appears only after every test has run —
// it reflects first-pick intuition, not the always-correct final code).
type Phase = "building" | "ready" | "running" | "results";

const EMPTY: Array<Answer | null> = [null, null, null, null, null];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// On desktop the page widens so the editor + debugger sit side by side; everything
// else stays reading-width and centered.
const NARROW = "lg:mx-auto lg:w-full lg:max-w-2xl";

function LangToggle({
  language,
  setLanguage,
}: {
  language: Language;
  setLanguage: (l: Language) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-black/15 p-0.5 text-xs font-semibold dark:border-white/20">
      {(["python", "java"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLanguage(l)}
          className={`rounded px-2.5 py-1 transition-colors ${
            language === l ? "bg-blue-600 text-white" : "opacity-60 hover:opacity-100"
          }`}
        >
          {l === "python" ? "Python" : "Java"}
        </button>
      ))}
    </div>
  );
}

export default function Player({
  puzzle,
  bridges,
  isDaily,
}: {
  puzzle: Puzzle;
  bridges: BridgeMap;
  isDaily: boolean;
}) {
  const [roundIdx, setRoundIdx] = useState(0);
  const [answers, setAnswers] = useState<Array<Answer | null>>(EMPTY);
  const [phase, setPhase] = useState<Phase>("building");
  const [language, setLanguage] = useState<Language>("python");
  const [results, setResults] = useState<TestRunResult[] | null>(null);
  // Progression payout for this run (XP delta, rank, streak) — set when the run
  // is recorded, shown on the results screen. Null until then (and for Java,
  // which has no test run to record).
  const [award, setAward] = useState<Award | null>(null);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<PanelView>({ kind: "idle" });
  const [runtimeReady, setRuntimeReady] = useState(false);
  // Coarse worker boot stage (downloading → booting → ready), shown while the runtime warms.
  const [loadStage, setLoadStage] = useState<LoadStage | null>(null);
  // A wrong pick opens a bridge; the round is locked but its slot stays unfilled (and
  // the partial run held back) until the bridge's Continue — per the mechanic, the
  // correct code "arrives" as the resolution of the bridge, not alongside the mistake.
  const [bridging, setBridging] = useState(false);
  // Monotonic id so a stale trace can never overwrite a newer panel state.
  const traceRunId = useRef(0);

  // Rounds lock strictly in order, so the locked count is a prefix length. The editor
  // and the partial run follow effectiveFilled, which lags one slot during a bridge.
  const lockedCount = answers.filter((a) => a !== null).length;
  const effectiveFilled = lockedCount - (bridging ? 1 : 0);

  // Warm Pyodide as soon as the puzzle opens (lazy per site, eager per puzzle). A failed
  // preload is ignored: the first real run retries and surfaces the error in the panel.
  useEffect(() => {
    let on = true;
    preloadPyodide((stage) => {
      if (on) setLoadStage(stage);
    }).then(
      () => {
        if (on) setRuntimeReady(true);
      },
      () => {},
    );
    return () => {
      on = false;
    };
  }, []);

  // After each resolved round (and on a Java→Python switch), run the partial program —
  // canonical fragments for filled rounds, stubs for the rest — against the first test
  // case and show STATE/TRACE/OUTPUT. Follows effectiveFilled, so during a bridge the
  // panel stays on the bridge's "Show me" output rather than jumping ahead. `phase` is
  // read but deliberately not a dependency: the building→ready transition happens at an
  // unchanged fill count and needs no rerun.
  useEffect(() => {
    if (language !== "python" || effectiveFilled === 0) return;
    if (phase === "running" || phase === "results") return;
    const id = ++traceRunId.current;
    setPanel({ kind: "loading" });
    const { code, stubReturnLine } = buildPartialRunnableCode(puzzle, effectiveFilled);
    const entry = parseEntryPoint(puzzle.canonicalSolutions.python);
    void runTraced(code, entry, puzzle.tests[0]?.input, stubReturnLine).then((trace) => {
      if (traceRunId.current === id) setPanel({ kind: "trace", trace });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFilled, language, puzzle]);

  // roundIdx is always within [0,4]; the guard satisfies the tuple's `| undefined`
  // under noUncheckedIndexedAccess.
  const round = puzzle.rounds[roundIdx];
  if (!round) return null;

  const correctIndex = round.correctIndex;
  const isLast = roundIdx === puzzle.rounds.length - 1;
  const current = answers[roundIdx] ?? null;
  const correctCount = answers.filter((a) => a?.correct).length;
  // The player's OWN pick per round (null until answered) — drives the end-screen review.
  const picks = answers.map((a) => (a ? a.chosen : null));

  // First click locks the round (score is first-pick correctness) and reveals immediately.
  // A correct pick fills the editor at once; a wrong pick opens the bridge first. The
  // updater guard makes a fast double-click harmless.
  function choose(i: 0 | 1 | 2 | 3) {
    if (phase !== "building" || current) return;
    setAnswers((prev) => {
      if (prev[roundIdx]) return prev;
      const next = [...prev];
      next[roundIdx] = { chosen: i, correct: i === correctIndex };
      return next;
    });
    if (i !== correctIndex) setBridging(true);
  }

  // Advance past the locked round; after the last round we land on "ready" (Run screen).
  function next() {
    if (phase !== "building") return;
    if (isLast) setPhase("ready");
    else setRoundIdx((i) => i + 1);
  }

  // Bridge "Show me": run the bridge's self-contained snippet (NOT the constructed
  // program) and show its printed output in the debugger panel.
  async function showBridgeTrace() {
    const bridge = current ? bridges[`${roundIdx}:${current.chosen}`] : undefined;
    if (!bridge) return;
    const id = ++traceRunId.current;
    setPanel({ kind: "loading" });
    const r = await runSnippet(bridge.trace_setup);
    if (traceRunId.current === id) setPanel({ kind: "snippet", output: r.output, error: r.error });
  }

  // Bridge resolved: the canonical line fills in (effectiveFilled catches up, which also
  // reruns the partial trace) and the next round begins.
  function endBridge() {
    setBridging(false);
    next();
  }

  // Run the tests ONE AT A TIME: each test's trace animates through the debugger panel,
  // its PASS/FAIL lands ~200ms after the output (so the output gets read first), and the
  // next test starts ~500ms later. The score appears only after all tests have run.
  // traceRunId doubles as the abort signal — reset() bumps it and the loop bows out.
  async function run() {
    setPhase("running");
    setResults([]);
    const runId = ++traceRunId.current;
    const { code, stubReturnLine } = buildPartialRunnableCode(puzzle, puzzle.rounds.length);
    const entry = parseEntryPoint(puzzle.canonicalSolutions.python);
    const acc: TestRunResult[] = [];
    for (let i = 0; i < puzzle.tests.length; i++) {
      const test = puzzle.tests[i];
      if (!test) break;
      setPanel({ kind: "loading" }); // clears the previous test's STATE/TRACE
      const trace = await runTraced(code, entry, test.input, stubReturnLine);
      if (traceRunId.current !== runId) return;
      setPanel({ kind: "trace", trace });
      await sleep(200);
      if (traceRunId.current !== runId) return;
      const actual = trace.returnJson !== null ? (JSON.parse(trace.returnJson) as unknown) : null;
      acc.push({
        index: i,
        input: test.input,
        expected: test.expected,
        actual,
        passed:
          trace.stopped === "completed" &&
          trace.error === null &&
          trace.returnJson !== null &&
          equalUnordered(actual, test.expected),
        error: trace.error,
      });
      setResults([...acc]);
      if (i < puzzle.tests.length - 1) {
        await sleep(500);
        if (traceRunId.current !== runId) return;
      }
    }
    // Record the finished run: XP is improvement-based (replays only pay the delta
    // over this puzzle's best), the streak moves only when this is today's puzzle.
    setAward(
      recordCompletion(
        puzzle.id,
        {
          firstPickScore: answers.filter((a) => a?.correct).length,
          roundCorrect: answers.map((a) => a?.correct ?? false),
          testsPassed: acc.filter((r) => r.passed).length,
          testsTotal: acc.length,
          lightningScore: null,
          lightningTotal: null,
        },
        isDaily,
      ),
    );
    setPhase("results");
  }

  function reset() {
    setRoundIdx(0);
    setAnswers(EMPTY);
    setResults(null);
    setAward(null);
    setCopied(false);
    setBridging(false);
    traceRunId.current++; // invalidate any in-flight trace
    setPanel({ kind: "idle" });
    setPhase("building"); // language intentionally kept; Pyodide stays loaded for the next run
  }

  // Locked rounds show first-pick correctness immediately; the current round is highlighted;
  // upcoming rounds are muted. Squares are visual progress only — never clickable.
  function squareClass(idx: number): string {
    const a = answers[idx];
    if (a) return a.correct ? "bg-green-600 text-white" : "bg-red-600 text-white";
    if (idx === roundIdx && phase === "building") {
      return "bg-blue-100 text-blue-900 ring-2 ring-blue-500";
    }
    return "bg-gray-200 text-gray-500";
  }

  // Until the round locks: neutral with hover. After: canonical green, the player's wrong
  // pick red, the rest dimmed — the per-round reveal.
  function optionClass(i: number): string {
    if (!current) {
      return "cursor-pointer border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5";
    }
    if (i === correctIndex) {
      return "border-2 border-green-600 bg-green-50 text-green-900 dark:bg-green-500/15 dark:text-white";
    }
    if (current.chosen === i) {
      return "border-2 border-red-600 bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-white";
    }
    return "border border-black/15 opacity-40 dark:border-white/20";
  }

  const isBuilding = phase === "building";
  // Editor + debugger stay visible through every phase: the tests animate through the
  // panel during "running", and the last trace remains on screen behind the score.
  const showBuildPanel = true;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 lg:max-w-5xl">
      <Link href="/" className="text-sm opacity-60 transition-colors hover:opacity-100">
        ← All puzzles
      </Link>

      {/* [A] Progress strip */}
      <div className={`mt-4 grid grid-cols-5 gap-2 ${NARROW}`}>
        {puzzle.rounds.map((r, idx) => (
          <div
            key={r.id}
            className={`flex h-10 items-center justify-center rounded-md text-sm font-semibold transition-colors ${squareClass(idx)}`}
          >
            {idx + 1}
          </div>
        ))}
      </div>

      {/* [B] Base problem card */}
      <section
        className={`mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15 ${NARROW}`}
      >
        <h1 className="text-xl font-bold tracking-tight">{puzzle.title}</h1>
        <p className="mt-2 text-sm leading-relaxed opacity-80">{puzzle.baseProblem.statement}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Input</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
              {JSON.stringify(puzzle.baseProblem.example.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Output</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/5 p-2 text-xs dark:bg-white/10">
              {JSON.stringify(puzzle.baseProblem.example.output, null, 2)}
            </pre>
          </div>
        </div>
      </section>

      {/* [B2] Editor + debugger — side by side on desktop, stacked on mobile. The editor
          fills every locked round with the CANONICAL fragment (corrective build); the
          debugger shows the partial program actually running. Canonical-only is the
          preserved session-004 fallback. */}
      {showBuildPanel && (
        <section className="mt-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
          <div>
            <div className="mb-2 flex justify-end">
              <LangToggle language={language} setLanguage={setLanguage} />
            </div>
            {puzzle.constructionMode === "diff" ? (
              <DiffPanel puzzle={puzzle} filledThroughRound={effectiveFilled} language={language} />
            ) : (
              <ConstructedCode
                puzzle={puzzle}
                completedThroughRound={effectiveFilled}
                language={language}
              />
            )}
          </div>
          <div className="mt-4 lg:mt-0">
            <div className="mb-2 flex h-7 items-center">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Debugger</p>
            </div>
            <DebuggerPanel
              view={panel}
              language={language}
              runtimeReady={runtimeReady}
              loadStage={loadStage}
            />
          </div>
        </section>
      )}

      {/* [C] Active round — one pick, then it locks and reveals */}
      {isBuilding && (
        <section className={`mt-6 ${NARROW}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
            Round {roundIdx + 1} of 5 · {round.stage}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{round.question}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {round.options.map((opt, i) => (
              <button
                key={i}
                type="button"
                disabled={current !== null}
                onClick={() => choose(i as 0 | 1 | 2 | 3)}
                className={`w-full rounded-lg px-4 py-3 text-left text-sm transition-colors ${optionClass(i)}`}
              >
                {opt.conceptLabel}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* [D] After a correct pick: advance. After a wrong pick: the bridge takes over —
          its Continue is the only way forward (keyed by round so its timer/state reset). */}
      {isBuilding && current && !bridging && (
        <div className={NARROW}>
          <button
            type="button"
            onClick={next}
            className="mt-5 w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {isLast ? "Done — review →" : "Next round →"}
          </button>
        </div>
      )}
      {isBuilding && current && bridging && (
        <div className={NARROW}>
          <BridgeCard
            key={roundIdx}
            bridge={bridges[`${roundIdx}:${current.chosen}`] ?? null}
            language={language}
            onShowMe={showBridgeTrace}
            onContinue={endBridge}
          />
        </div>
      )}

      {/* [E] Ready — the complete solution sits above; run it (Python) or switch (Java) */}
      {phase === "ready" && (
        <section className={`mt-6 ${NARROW}`}>
          {language === "python" ? (
            <button
              type="button"
              onClick={run}
              className="w-full cursor-pointer rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Run solution →
            </button>
          ) : (
            <p className="rounded-lg border border-black/10 bg-black/[0.03] p-4 text-sm leading-relaxed opacity-80 dark:border-white/15 dark:bg-white/5">
              Running is Python-only. Switch the language toggle to Python to watch your solution
              run — the review below works in either language.
            </p>
          )}
          {/* Java has no run step, so the full reveal lives right here under the note. */}
          {language === "java" && Results()}
        </section>
      )}

      {/* [E2] Sequential test run — results accumulate as each test animates through the
          debugger panel; this list stays put once the score appears below it. */}
      {(phase === "running" || phase === "results") && language === "python" && results && (
        <section className={`mt-6 ${NARROW}`}>
          {phase === "running" && (
            <p className="mb-3 text-sm font-semibold opacity-70">
              Running test {Math.min(results.length + 1, puzzle.tests.length)} of {puzzle.tests.length}…
            </p>
          )}
          <TestResults results={results} />
        </section>
      )}

      {/* [F] Results — the score appears only AFTER every test has run */}
      {phase === "results" && Results()}
    </main>
  );

  // Copy the Wordle-style emoji grid for this run. `award` gates the button, so
  // the streak number shown is always the post-recording value.
  async function share() {
    if (!award) return;
    const ok = await copyToClipboard(
      buildShareText({
        puzzleNumber: Number(puzzle.id.slice("puzzle-".length)),
        title: puzzle.title,
        roundCorrect: answers.map((a) => a?.correct ?? false),
        testsPassed: results?.filter((r) => r.passed).length ?? 0,
        testsTotal: results?.length ?? 0,
        lightningScore: null,
        lightningTotal: null,
        streak: award.streak.current,
      }),
    );
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Results block, shared by the "results" phase and the Java "ready" state (which has no run).
  // Called as Results() (not <Results/>) so it inlines as children — re-renders don't remount
  // ReviewDiff and its rationale-toggle state survives a language switch.
  function Results() {
    return (
      <section
        className={`mt-6 rounded-lg border border-black/10 p-6 dark:border-white/15 ${NARROW}`}
      >
        <div className="text-center">
          <p className="text-sm uppercase tracking-wide opacity-50">Your score</p>
          <p className="mt-1 text-5xl font-bold tabular-nums">{correctCount}/5</p>
          <p className="mt-1 text-xs uppercase tracking-wide opacity-50">rounds on first pick</p>
          <div className="mt-4 flex justify-center gap-2">
            {answers.map((a, idx) => (
              <div
                key={idx}
                className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${
                  a?.correct ? "bg-green-600 text-white" : "bg-red-600 text-white"
                }`}
              >
                {idx + 1}
              </div>
            ))}
          </div>
          {/* The tests always pass: bridging corrected the code. The score above is the
              intuition measure; this line just confirms the algorithm works. */}
          {language === "python" && results && (
            <p className="mt-3 text-sm font-semibold">
              <span className={results.every((r) => r.passed) ? "text-green-600" : "text-red-600"}>
                {results.filter((r) => r.passed).length}/{results.length}
              </span>{" "}
              tests passing
            </p>
          )}
        </div>

        {/* Progression payout — XP delta, rank ladder position, streak. Only rendered
            when this run was recorded (Python run completed). */}
        {award && (
          <div className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">
                {award.xpGained > 0 ? (
                  <span className="text-green-600">+{award.xpGained} XP</span>
                ) : (
                  <span className="opacity-60">+0 XP — beat your best run to earn more</span>
                )}
              </p>
              <p className="text-xs tabular-nums opacity-60">{award.totalXp} XP total</p>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold uppercase tracking-wide opacity-70">
                  {award.rank.title}
                </span>
                {award.next && (
                  <span className="opacity-50">
                    {award.next.minXp - award.totalXp} XP to {award.next.title}
                  </span>
                )}
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-700"
                  style={{ width: `${Math.round(award.rankProgress * 100)}%` }}
                />
              </div>
            </div>
            {award.rankedUp && (
              <p className="mt-3 rounded-md border border-green-600/40 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-400">
                Rank up! You are now {award.rank.title}.
              </p>
            )}
            {isDaily && award.streakExtended && (
              <p className="mt-3 text-sm font-semibold">
                {"\u{1F525}"} {award.streak.current}-day streak
                {award.streak.current === award.streak.best && award.streak.current > 1
                  ? " — personal best"
                  : ""}
              </p>
            )}
          </div>
        )}

        {language === "java" && (
          <p className="mt-6 rounded-lg border border-black/10 bg-black/[0.03] p-4 text-sm leading-relaxed opacity-80 dark:border-white/15 dark:bg-white/5">
            Switch to Python to watch the solution run against the test cases — execution is
            Python-only.
          </p>
        )}

        {puzzle.constructionMode === "diff" ? (
          /* Review — PR-style diff of your picks vs. the canonical; tap a line for why */
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Review</p>
              <LangToggle language={language} setLanguage={setLanguage} />
            </div>
            <ReviewDiff puzzle={puzzle} picks={picks} language={language} />
            <p className="mt-2 text-xs opacity-50">Tap any line to see the reasoning.</p>
          </div>
        ) : (
          <>
            {/* Solution you built */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-50">
                  Solution you built
                </p>
                <LangToggle language={language} setLanguage={setLanguage} />
              </div>
              <pre className="overflow-x-auto rounded bg-black/5 p-3 text-xs leading-relaxed dark:bg-white/10">
                <code>{buildConstructedCode(puzzle, 5, language)}</code>
              </pre>
            </div>

            {/* Per-stage breakdown: which stages you nailed vs. missed */}
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
                Stage breakdown
              </p>
              <ul className="flex flex-col gap-2">
                {puzzle.rounds.map((r, i) => {
                  const ok = answers[i]?.correct;
                  return (
                    <li key={r.id} className="flex items-start gap-2 text-xs">
                      <span className={`mt-1 font-bold ${ok ? "text-green-600" : "text-red-600"}`}>
                        {ok ? "✓" : "✗"}
                      </span>
                      <span className="mt-1 w-20 shrink-0 font-semibold opacity-70">{r.stage}</span>
                      <code className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded bg-black/5 px-1.5 py-1 opacity-80 dark:bg-white/10">
                        {r.options[r.correctIndex].fragments[language]}
                      </code>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {award && (
            <button
              type="button"
              onClick={share}
              className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-green-700"
            >
              {copied ? "Copied!" : "Share result"}
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Play again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-black/15 px-5 py-2.5 text-center font-semibold transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
          >
            Back to list
          </Link>
        </div>
      </section>
    );
  }
}
