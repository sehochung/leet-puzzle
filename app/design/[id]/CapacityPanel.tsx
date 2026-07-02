"use client";

import type { CapacityFact } from "@/lib/design";

// Design mode's debugger: the back-of-envelope numbers, revealed round by round.
// Facts the player hasn't reached yet stay as dimmed placeholders so the shape
// of the estimation work is visible from the start.

export default function CapacityPanel({
  facts,
  filledThroughRound,
}: {
  facts: readonly CapacityFact[];
  filledThroughRound: number;
}) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <p className="text-xs font-semibold uppercase tracking-wide opacity-50">Back of envelope</p>
      <ul className="mt-3 flex flex-col gap-2">
        {facts.map((f, i) => {
          const revealed = f.appearsAtRound <= filledThroughRound;
          const isNew = revealed && f.appearsAtRound === filledThroughRound;
          return (
            <li
              key={i}
              className={`flex items-baseline justify-between gap-3 text-sm transition-opacity duration-500 ${
                revealed ? "" : "opacity-30"
              }`}
            >
              <span className="opacity-70">{revealed ? f.label : "· · ·"}</span>
              <span
                className={`text-right font-semibold tabular-nums ${
                  isNew ? "text-blue-600 dark:text-blue-400" : ""
                }`}
              >
                {revealed ? f.value : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
