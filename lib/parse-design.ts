import {
  DESIGN_STAGE_ORDER,
  type CapacityFact,
  type DesignOption,
  type DesignPuzzle,
  type DesignRound,
  type DiagramEdge,
  type DiagramNode,
} from "./design";

// Runtime gate for design puzzles — same assertion style as parse-puzzle.ts,
// field-path errors, no libs. Mirrored by the design section of
// scripts/validate-puzzles.mjs; keep the two in sync.

function assert(cond: boolean, path: string, msg: string): asserts cond {
  if (!cond) throw new Error(`${path}: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, path: string): string {
  assert(typeof v === "string", path, `expected string, got ${typeof v}`);
  return v;
}

function nonEmptyStr(v: unknown, path: string): string {
  const s = str(v, path);
  assert(s.length > 0, path, "expected non-empty string");
  return s;
}

function num(v: unknown, path: string): number {
  assert(
    typeof v === "number" && Number.isFinite(v),
    path,
    `expected finite number, got ${typeof v}`,
  );
  return v;
}

function intIn(v: unknown, lo: number, hi: number, path: string): number {
  const n = num(v, path);
  assert(Number.isInteger(n) && n >= lo && n <= hi, path, `expected integer in [${lo},${hi}], got ${n}`);
  return n;
}

function parseOption(v: unknown, path: string): DesignOption {
  assert(isRecord(v), path, "expected object");
  return {
    conceptLabel: nonEmptyStr(v.conceptLabel, `${path}.conceptLabel`),
    rationale: nonEmptyStr(v.rationale, `${path}.rationale`),
  };
}

function parseRound(v: unknown, i: number): DesignRound {
  const path = `rounds[${i}]`;
  assert(isRecord(v), path, "expected object");
  const expectedStage = DESIGN_STAGE_ORDER[i];
  assert(expectedStage !== undefined, path, `unexpected round index ${i}`);
  const stage = str(v.stage, `${path}.stage`);
  assert(stage === expectedStage, `${path}.stage`, `expected "${expectedStage}", got "${stage}"`);
  const id = num(v.id, `${path}.id`);
  assert(id === i + 1, `${path}.id`, `expected ${i + 1}, got ${id}`);
  const options = v.options;
  assert(Array.isArray(options), `${path}.options`, "expected array");
  assert(options.length === 4, `${path}.options`, `expected length 4, got ${options.length}`);
  const ci = intIn(v.correctIndex, 0, 3, `${path}.correctIndex`) as 0 | 1 | 2 | 3;
  return {
    id,
    stage: expectedStage,
    question: nonEmptyStr(v.question, `${path}.question`),
    options: [
      parseOption(options[0], `${path}.options[0]`),
      parseOption(options[1], `${path}.options[1]`),
      parseOption(options[2], `${path}.options[2]`),
      parseOption(options[3], `${path}.options[3]`),
    ],
    correctIndex: ci,
  };
}

const SHAPES = new Set(["box", "store", "actor"]);

function parseNode(v: unknown, i: number): DiagramNode {
  const path = `diagram.nodes[${i}]`;
  assert(isRecord(v), path, "expected object");
  const shape = str(v.shape, `${path}.shape`);
  assert(SHAPES.has(shape), `${path}.shape`, `expected box|store|actor, got "${shape}"`);
  const node: DiagramNode = {
    id: nonEmptyStr(v.id, `${path}.id`),
    label: nonEmptyStr(v.label, `${path}.label`),
    shape: shape as DiagramNode["shape"],
    x: num(v.x, `${path}.x`),
    y: num(v.y, `${path}.y`),
    w: num(v.w, `${path}.w`),
    h: num(v.h, `${path}.h`),
    appearsAtRound: intIn(v.appearsAtRound, 0, 5, `${path}.appearsAtRound`),
  };
  if (v.sublabel !== undefined) node.sublabel = nonEmptyStr(v.sublabel, `${path}.sublabel`);
  return node;
}

function parseEdge(v: unknown, i: number, nodeIds: Set<string>): DiagramEdge {
  const path = `diagram.edges[${i}]`;
  assert(isRecord(v), path, "expected object");
  const from = nonEmptyStr(v.from, `${path}.from`);
  const to = nonEmptyStr(v.to, `${path}.to`);
  assert(nodeIds.has(from), `${path}.from`, `no node with id "${from}"`);
  assert(nodeIds.has(to), `${path}.to`, `no node with id "${to}"`);
  const edge: DiagramEdge = {
    from,
    to,
    appearsAtRound: intIn(v.appearsAtRound, 0, 5, `${path}.appearsAtRound`),
  };
  if (v.label !== undefined) edge.label = nonEmptyStr(v.label, `${path}.label`);
  return edge;
}

function parseCapacity(v: unknown, i: number): CapacityFact {
  const path = `capacity[${i}]`;
  assert(isRecord(v), path, "expected object");
  return {
    label: nonEmptyStr(v.label, `${path}.label`),
    value: nonEmptyStr(v.value, `${path}.value`),
    appearsAtRound: intIn(v.appearsAtRound, 1, 5, `${path}.appearsAtRound`),
  };
}

export function parseDesignPuzzle(data: unknown): DesignPuzzle {
  assert(isRecord(data), "design", "expected object");
  const id = str(data.id, "id");
  assert(/^design-\d{3}$/.test(id), "id", `expected /^design-\\d{3}$/, got "${id}"`);

  const requirements = data.requirements;
  assert(Array.isArray(requirements), "requirements", "expected array");
  assert(requirements.length > 0, "requirements", "expected non-empty array");

  const rounds = data.rounds;
  assert(Array.isArray(rounds), "rounds", "expected array");
  assert(rounds.length === 5, "rounds", `expected length 5, got ${rounds.length}`);

  const diagram = data.diagram;
  assert(isRecord(diagram), "diagram", "expected object");
  const nodes = diagram.nodes;
  assert(Array.isArray(nodes), "diagram.nodes", "expected array");
  assert(nodes.length > 0, "diagram.nodes", "expected non-empty array");
  const parsedNodes = nodes.map((n, i) => parseNode(n, i));
  const nodeIds = new Set(parsedNodes.map((n) => n.id));
  assert(nodeIds.size === parsedNodes.length, "diagram.nodes", "duplicate node ids");
  const edges = diagram.edges;
  assert(Array.isArray(edges), "diagram.edges", "expected array");
  const parsedEdges = edges.map((e, i) => parseEdge(e, i, nodeIds));

  const capacity = data.capacity;
  assert(Array.isArray(capacity), "capacity", "expected array");

  return {
    id,
    title: nonEmptyStr(data.title, "title"),
    brief: nonEmptyStr(data.brief, "brief"),
    requirements: requirements.map((r, i) => nonEmptyStr(r, `requirements[${i}]`)),
    rounds: [
      parseRound(rounds[0], 0),
      parseRound(rounds[1], 1),
      parseRound(rounds[2], 2),
      parseRound(rounds[3], 3),
      parseRound(rounds[4], 4),
    ],
    diagram: { nodes: parsedNodes, edges: parsedEdges },
    capacity: capacity.map((c, i) => parseCapacity(c, i)),
  };
}
