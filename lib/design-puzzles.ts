import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDesignPuzzle } from "./parse-design";
import type { DesignPuzzle } from "./design";

// Design-puzzle loader — mirrors lib/puzzles.ts, same security posture: the id
// is validated against a strict pattern BEFORE any filesystem access, so a
// crafted id can never escape /puzzles.

const PUZZLES_DIR = join(process.cwd(), "puzzles");
const ID_RE = /^design-\d{3}$/;
const ID_FILE_RE = /^design-\d{3}\.json$/;

export async function loadAllDesignPuzzles(): Promise<{
  designs: DesignPuzzle[];
  errors: string[];
}> {
  const files = (await readdir(PUZZLES_DIR)).filter((f) => ID_FILE_RE.test(f)).sort();
  const designs: DesignPuzzle[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      designs.push(parseDesignPuzzle(JSON.parse(await readFile(join(PUZZLES_DIR, file), "utf8"))));
    } catch (e) {
      errors.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  designs.sort((a, b) => a.id.localeCompare(b.id));
  return { designs, errors };
}

export async function loadDesignPuzzleById(id: string): Promise<DesignPuzzle | null> {
  if (!ID_RE.test(id)) return null;
  try {
    const raw = await readFile(join(PUZZLES_DIR, `${id}.json`), "utf8");
    return parseDesignPuzzle(JSON.parse(raw));
  } catch {
    return null;
  }
}
