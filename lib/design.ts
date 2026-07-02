// System-design puzzle schema. Same corrective 5-round mechanic as the code
// puzzles, but the artifact being built is an architecture diagram instead of a
// program, and the "debugger" is a back-of-envelope capacity panel. Stages
// follow the arc of a real design interview: clarify load → shape the API →
// pick the data/keying strategy → scale the hot path → defend a tradeoff.

export type DesignStage = "requirements" | "api" | "data" | "scale" | "tradeoff";

export const DESIGN_STAGE_ORDER: readonly DesignStage[] = [
  "requirements",
  "api",
  "data",
  "scale",
  "tradeoff",
] as const;

export type DesignOption = {
  conceptLabel: string; // shown on the button
  rationale: string; // shown on reveal (why right / why wrong)
};

export type DesignRound = {
  id: number; // 1..5
  stage: DesignStage; // must equal DESIGN_STAGE_ORDER[id-1]
  question: string;
  options: readonly [DesignOption, DesignOption, DesignOption, DesignOption];
  correctIndex: 0 | 1 | 2 | 3;
};

// Diagram geometry is authored in SVG user units against a 720x340 viewBox.
// appearsAtRound: 0 = visible from the start, 1..5 = materializes when that
// round locks (corrective: the canonical architecture always assembles).
export type DiagramNode = {
  id: string;
  label: string;
  sublabel?: string;
  shape: "box" | "store" | "actor"; // store = datastore (cylinder-ish), actor = the client
  x: number;
  y: number;
  w: number;
  h: number;
  appearsAtRound: number;
};

export type DiagramEdge = {
  from: string; // node id
  to: string; // node id
  label?: string;
  appearsAtRound: number;
};

// One back-of-envelope figure, revealed as its round locks — the numeric story
// of the system growing alongside the picture.
export type CapacityFact = {
  label: string;
  value: string;
  appearsAtRound: number; // 1..5
};

export type DesignPuzzle = {
  id: string; // /^design-\d{3}$/
  title: string;
  brief: string; // the prompt, e.g. "Design a URL shortener..."
  requirements: readonly string[]; // given constraints, shown in the problem card
  rounds: readonly [DesignRound, DesignRound, DesignRound, DesignRound, DesignRound];
  diagram: { nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] };
  capacity: readonly CapacityFact[];
};
