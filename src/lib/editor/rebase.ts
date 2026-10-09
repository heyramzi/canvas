// Conflict rebase for the autosave PUT. On a 409, local changes since the last
// save replay as ops on the server document, instead of overwriting the other writer.

import { tryCatch } from "#src/result.js";
import { applyOps, type CanvasOp } from "#src/ops/ops.js";
import type { RawCanvasData } from "#src/types.js";
import { sortParentsFirst } from "#src/headless/canvas-cleanup.js";

type DocNode = Record<string, unknown> & {
  id: string;
  position?: { x: number; y: number };
  parentId?: string;
  data?: Record<string, unknown>;
  style?: unknown;
  width?: unknown;
  height?: unknown;
  type?: unknown;
};
type DocEdge = Record<string, unknown> & { id: string };
export type DiagramDoc = { nodes: DocNode[]; edges: DocEdge[] };

const EDGE_PATCH_FIELDS = [
  "label",
  "animated",
  "type",
  "style",
  "sourceHandle",
  "targetHandle",
] as const;

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

type SizePatch = { style?: Record<string, unknown>; width?: number; height?: number };

function objectStyle(node: DocNode): Record<string, unknown> | undefined {
  return node.style && typeof node.style === "object"
    ? (node.style as Record<string, unknown>)
    : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function addNodeOp(node: DocNode): CanvasOp {
  const style = objectStyle(node);
  const width = numberOrUndefined(node.width);
  const height = numberOrUndefined(node.height);
  return {
    kind: "addNode",
    node: {
      id: node.id,
      type: String(node.type ?? "node"),
      position: node.position ?? { x: 0, y: 0 },
      data: node.data ?? {},
      ...(style ? { style } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(node.parentId ? { parentId: node.parentId } : {}),
    },
  };
}

function sizePatchOf(before: DocNode, node: DocNode): SizePatch {
  const patch: SizePatch = {};
  const style = objectStyle(node);
  if (style && json(before.style) !== json(node.style)) patch.style = style;
  const width = numberOrUndefined(node.width);
  if (width !== undefined && before.width !== node.width) patch.width = width;
  const height = numberOrUndefined(node.height);
  if (height !== undefined && before.height !== node.height) patch.height = height;
  return patch;
}

function changedNodeOps(before: DocNode, node: DocNode): CanvasOp[] {
  const ops: CanvasOp[] = [];
  if (node.position && json(before.position) !== json(node.position)) {
    ops.push({ kind: "moveNode", nodeId: node.id, position: node.position });
  }
  const parentId = node.parentId ?? null;
  if ((before.parentId ?? null) !== parentId) {
    ops.push({ kind: "setParent", nodeId: node.id, parentId });
  }
  if (node.data && json(before.data) !== json(node.data)) {
    ops.push({ kind: "patchNode", nodeId: node.id, data: node.data });
  }
  const sizePatch = sizePatchOf(before, node);
  if (Object.keys(sizePatch).length > 0) {
    ops.push({ kind: "patchNode", nodeId: node.id, ...sizePatch });
  }
  return ops;
}

function nodeOps(base: DiagramDoc, current: DiagramDoc): CanvasOp[] {
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const currentIds = new Set(current.nodes.map((n) => n.id));
  const removed: CanvasOp[] = base.nodes
    .filter((n) => !currentIds.has(n.id))
    .map((n) => ({ kind: "removeNode", nodeId: n.id }));

  // WHY parents first: an added child references its added parent in the same
  // batch, and applyOps validates parent existence at each step.
  const added = sortParentsFirst(current.nodes.filter((n) => !baseNodes.has(n.id))).map(addNodeOp);

  const changed = current.nodes.flatMap((node) => {
    const before = baseNodes.get(node.id);
    return before ? changedNodeOps(before, node) : [];
  });
  return [...removed, ...added, ...changed];
}

function addEdgeOp(edge: DocEdge): CanvasOp {
  const optional = (key: "sourceHandle" | "targetHandle" | "type") =>
    typeof edge[key] === "string" ? { [key]: edge[key] } : {};
  return {
    kind: "addEdge",
    edge: {
      id: edge.id,
      source: String(edge.source),
      target: String(edge.target),
      ...optional("sourceHandle"),
      ...optional("targetHandle"),
      ...optional("type"),
    },
  };
}

function patchEdgeOps(before: DocEdge, edge: DocEdge): CanvasOp[] {
  const patch: Record<string, unknown> = {};
  for (const field of EDGE_PATCH_FIELDS) {
    if (edge[field] !== undefined && json(before[field]) !== json(edge[field])) {
      patch[field] = edge[field];
    }
  }
  if (Object.keys(patch).length === 0) return [];
  return [{ kind: "patchEdge", edgeId: edge.id, patch } as CanvasOp];
}

function edgeOps(base: DiagramDoc, current: DiagramDoc): CanvasOp[] {
  const baseEdges = new Map(base.edges.map((e) => [e.id, e]));
  const currentIds = new Set(current.edges.map((e) => e.id));
  const removed: CanvasOp[] = base.edges
    .filter((e) => !currentIds.has(e.id))
    .map((e) => ({ kind: "removeEdge", edgeId: e.id }));
  const upserted = current.edges.flatMap((edge) => {
    const before = baseEdges.get(edge.id);
    return before ? patchEdgeOps(before, edge) : [addEdgeOp(edge)];
  });
  return [...removed, ...upserted];
}

/**
 * Express the difference between two persisted documents as ops.
 * Data patches are whole-data merges: a key deleted locally survives on the
 * base (patchNode merges), which is an accepted approximation.
 */
export function diffToOps(base: DiagramDoc, current: DiagramDoc): CanvasOp[] {
  return [...nodeOps(base, current), ...edgeOps(base, current)];
}

/**
 * Replay local changes (lastSaved -> local) on the server document. Returns
 * null when impossible, like a patched node deleted, so the save error shows.
 */
export function rebaseDiagram(
  serverDoc: DiagramDoc,
  lastSaved: DiagramDoc,
  local: DiagramDoc,
): RawCanvasData | null {
  const ops = diffToOps(lastSaved, local);
  if (ops.length === 0) {
    return { nodes: serverDoc.nodes, edges: serverDoc.edges };
  }
  const res = tryCatch(() => applyOps({ nodes: serverDoc.nodes, edges: serverDoc.edges }, ops));
  return res.ok ? res.value : null;
}
