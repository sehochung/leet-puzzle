"use client";

// One row of a GitHub-style unified diff, shared by the play-time DiffPanel and the
// end-screen ReviewDiff. Pure presentational: gutter (line number + +/- symbol) and a
// monospace code cell. `min-w-full w-max` lets the tinted background span the full scroll
// width inside an overflow-x-auto parent, so long lines scroll without clipping the tint.
//   add        -> green "+"  (correct pick / canonical)
//   remove     -> red   "-"  (wrong pick)
//   neutral    -> committed pick during the blind build: numbered, no +/- , no tint (a diff
//                 "context" line) — correctness is hidden until the end-screen reveal
//   comment    -> muted stage label, blank gutter
//   placeholder-> muted "___" slot not yet filled, blank gutter

export type DiffTone = "add" | "remove" | "neutral" | "comment" | "placeholder";

export default function DiffLine({
  lineNo,
  sym,
  text,
  tone,
  onClick,
}: {
  lineNo?: number;
  sym?: "+" | "-";
  text: string;
  tone: DiffTone;
  onClick?: () => void; // when set the row is a button (end-screen rationale toggle)
}) {
  const bg =
    tone === "add"
      ? "bg-[#e6ffec] dark:bg-[rgba(46,160,67,0.15)]"
      : tone === "remove"
        ? "bg-[#ffebe9] dark:bg-[rgba(248,81,73,0.15)]"
        : "";
  const symColor =
    tone === "add"
      ? "text-green-700 dark:text-green-400"
      : tone === "remove"
        ? "text-red-700 dark:text-red-400"
        : "";
  const textColor = tone === "comment" || tone === "placeholder" ? "opacity-45" : "";

  const cls = `flex w-max min-w-full font-mono text-[13px] leading-[1.6] ${bg}`;
  const body = (
    <>
      <span className="w-10 shrink-0 select-none pr-2 pl-3 text-right tabular-nums opacity-40">
        {lineNo ?? ""}
      </span>
      <span className={`w-4 shrink-0 select-none text-center ${symColor}`}>{sym ?? ""}</span>
      <span className={`whitespace-pre pr-4 ${textColor}`}>{text || " "}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} cursor-pointer text-left transition hover:brightness-95 dark:hover:brightness-125`}
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
