// Wordle-style share text: an emoji grid of the run that reads at a glance and
// pastes anywhere plain text goes. Kept dependency-free; clipboard write has a
// legacy <textarea> fallback for browsers without navigator.clipboard.

export type ShareInput = {
  puzzleNumber: number; // e.g. 3 for puzzle-003
  title: string;
  roundCorrect: readonly boolean[];
  testsPassed: number;
  testsTotal: number;
  lightningScore: number | null;
  lightningTotal: number | null;
  streak: number; // current daily streak; 0 hides the line
};

export function buildShareText(s: ShareInput): string {
  const grid = s.roundCorrect.map((c) => (c ? "\u{1F7E9}" : "\u{1F7E5}")).join("");
  const built = s.roundCorrect.filter(Boolean).length;
  const lines = [
    `Interview Intuition #${s.puzzleNumber} — ${s.title}`,
    `${grid} ${built}/${s.roundCorrect.length} build`,
  ];
  const extras: string[] = [];
  if (s.testsTotal > 0) extras.push(`\u{1F9EA} ${s.testsPassed}/${s.testsTotal} tests`);
  if (s.lightningScore !== null && s.lightningTotal !== null && s.lightningTotal > 0) {
    extras.push(`⚡ ${s.lightningScore}/${s.lightningTotal} lightning`);
  }
  if (extras.length > 0) lines.push(extras.join(" · "));
  if (s.streak > 1) lines.push(`\u{1F525} ${s.streak}-day streak`);
  return lines.join("\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
