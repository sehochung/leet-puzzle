import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePuzzle } from "./parse-puzzle";
import type { Puzzle } from "./puzzle";

const PUZZLES_DIR = join(process.cwd(), "puzzles");
const ID_RE = /^puzzle-\d{3}$/;

// Loads every puzzle. A single malformed file is collected into `errors`
// instead of throwing, so the list page can degrade gracefully.
export async function loadAllPuzzles(): Promise<{ puzzles: Puzzle[]; errors: string[] }> {
  const files = (await readdir(PUZZLES_DIR)).filter((f) => f.endsWith(".json")).sort();
  const puzzles: Puzzle[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      puzzles.push(parsePuzzle(JSON.parse(await readFile(join(PUZZLES_DIR, file), "utf8"))));
    } catch (e) {
      errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  puzzles.sort((a, b) => a.id.localeCompare(b.id));
  return { puzzles, errors };
}

// Returns null on a bad id (incl. path-traversal attempts), a missing file, or
// invalid contents — callers map null to notFound(). The id is validated
// BEFORE any filesystem access so a crafted id can never escape /puzzles.
export async function loadPuzzleById(id: string): Promise<Puzzle | null> {
  if (!ID_RE.test(id)) return null;
  try {
    const raw = await readFile(join(PUZZLES_DIR, `${id}.json`), "utf8");
    return parsePuzzle(JSON.parse(raw));
  } catch {
    return null;
  }
}
