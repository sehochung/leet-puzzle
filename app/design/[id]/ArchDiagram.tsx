"use client";

import type { DesignPuzzle, DiagramEdge, DiagramNode } from "@/lib/design";

// The design-mode analogue of the code editor: the canonical architecture
// assembles one round at a time. Components that haven't been unlocked yet
// render as dashed "?" ghosts (the map of what's coming), the current round's
// additions land in blue, and everything older settles into neutral ink.
// Palette per project rule: blue = current, otherwise currentColor only.

const BLUE = "#2563eb"; // Tailwind blue-600

function center(n: DiagramNode): { cx: number; cy: number } {
  return { cx: n.x + n.w / 2, cy: n.y + n.h / 2 };
}

// Point where the center-to-center line exits a node's rectangle, so edges
// start/end at borders instead of poking into the boxes.
function borderPoint(n: DiagramNode, towardX: number, towardY: number): { x: number; y: number } {
  const { cx, cy } = center(n);
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? n.w / 2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? n.h / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);
  return { x: cx + dx * t, y: cy + dy * t };
}

function NodeShape({
  node,
  state,
}: {
  node: DiagramNode;
  state: "ghost" | "current" | "settled";
}) {
  const stroke = state === "current" ? BLUE : "currentColor";
  const strokeWidth = state === "current" ? 2 : 1.25;
  const opacity = state === "ghost" ? 0.28 : state === "settled" ? 0.75 : 1;
  const dash = state === "ghost" ? "4 4" : undefined;
  const { cx } = center(node);

  return (
    <g opacity={opacity}>
      {node.shape === "store" ? (
        // Cylinder-ish datastore: body with a bottom arc + a top ellipse.
        <>
          <path
            d={`M ${node.x} ${node.y + 8} L ${node.x} ${node.y + node.h - 8} A ${node.w / 2} 8 0 0 0 ${node.x + node.w} ${node.y + node.h - 8} L ${node.x + node.w} ${node.y + 8}`}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dash}
          />
          <ellipse
            cx={cx}
            cy={node.y + 8}
            rx={node.w / 2}
            ry={8}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dash}
          />
        </>
      ) : (
        <rect
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={node.shape === "actor" ? node.h / 2 : 8}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
        />
      )}
      {state === "ghost" ? (
        <text
          x={cx}
          y={center(node).cy + 5}
          textAnchor="middle"
          fontSize={16}
          fontWeight={700}
          fill="currentColor"
        >
          ?
        </text>
      ) : (
        <>
          <text
            x={cx}
            y={node.y + (node.sublabel ? node.h / 2 - 2 : node.h / 2 + 4)}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill={state === "current" ? BLUE : "currentColor"}
          >
            {node.label}
          </text>
          {node.sublabel && (
            <text
              x={cx}
              y={node.y + node.h / 2 + 13}
              textAnchor="middle"
              fontSize={9.5}
              fill="currentColor"
              opacity={0.65}
            >
              {node.sublabel}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function EdgeLine({
  edge,
  nodes,
  state,
}: {
  edge: DiagramEdge;
  nodes: readonly DiagramNode[];
  state: "ghost" | "current" | "settled";
}) {
  const from = nodes.find((n) => n.id === edge.from);
  const to = nodes.find((n) => n.id === edge.to);
  if (!from || !to) return null;
  const fc = center(from);
  const tc = center(to);
  const p1 = borderPoint(from, tc.cx, tc.cy);
  const p2 = borderPoint(to, fc.cx, fc.cy);
  const stroke = state === "current" ? BLUE : "currentColor";
  const opacity = state === "ghost" ? 0.22 : state === "settled" ? 0.55 : 1;
  const marker = state === "current" ? "url(#arrow-blue)" : "url(#arrow-ink)";
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  return (
    <g opacity={opacity}>
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={stroke}
        strokeWidth={state === "current" ? 1.75 : 1.25}
        strokeDasharray={state === "ghost" ? "4 4" : undefined}
        markerEnd={state === "ghost" ? undefined : marker}
      />
      {edge.label && state !== "ghost" && (
        <text
          x={midX}
          y={midY - 5}
          textAnchor="middle"
          fontSize={9}
          fill={state === "current" ? BLUE : "currentColor"}
          opacity={0.9}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

export default function ArchDiagram({
  puzzle,
  filledThroughRound,
}: {
  puzzle: DesignPuzzle;
  filledThroughRound: number; // 0..5 — rounds locked so far
}) {
  const stateOf = (appearsAt: number): "ghost" | "current" | "settled" => {
    if (appearsAt > filledThroughRound) return "ghost";
    if (appearsAt === filledThroughRound && filledThroughRound > 0) return "current";
    return "settled";
  };

  return (
    <div className="rounded-lg border border-black/10 p-2 dark:border-white/15">
      <svg viewBox="0 0 720 340" className="h-auto w-full" role="img" aria-label="Architecture diagram">
        <defs>
          <marker id="arrow-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity={0.7} />
          </marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={BLUE} />
          </marker>
        </defs>
        {puzzle.diagram.edges.map((e, i) => (
          <EdgeLine key={i} edge={e} nodes={puzzle.diagram.nodes} state={stateOf(e.appearsAtRound)} />
        ))}
        {puzzle.diagram.nodes.map((n) => (
          <NodeShape key={n.id} node={n} state={stateOf(n.appearsAtRound)} />
        ))}
      </svg>
    </div>
  );
}
