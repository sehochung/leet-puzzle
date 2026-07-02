import { notFound } from "next/navigation";
import { loadDesignPuzzleById } from "@/lib/design-puzzles";
import DesignPlayer from "./DesignPlayer";

// Same posture as /puzzle/[id]: the id is validated against /^design-\d{3}$/
// BEFORE any filesystem access, and the page renders per-request for the CSP nonce.
export const dynamic = "force-dynamic";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const puzzle = await loadDesignPuzzleById(id);
  if (!puzzle) notFound();
  return <DesignPlayer puzzle={puzzle} />;
}
