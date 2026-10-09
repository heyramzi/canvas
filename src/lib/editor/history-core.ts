// Pure diff/apply core for diagram history. Each entry holds only the touched
// nodes and edges, so ops, layouts and xyflow's own writes share one mechanism.

import type { Node, Edge } from "@xyflow/svelte";
import { sortParentsFirst } from "#src/headless/canvas-cleanup.js";

export type FlowState = { nodes: Node[]; edges: Edge[] };

export type HistoryEntry = {
  nodesBefore: Node[];
  nodesAfter: Node[];
  edgesBefore: Edge[];
  edgesAfter: Edge[];
};

// Fields that churn without changing the document. Stripped, so selecting isn't
// an undo step and undo doesn't restore a stale selection.
const VOLATILE_NODE_FIELDS = new Set(["selected", "dragging", "measured", "resizing"]);
const VOLATILE_EDGE_FIELDS = new Set(["selected"]);

function stripVolatile<T extends Record<string, unknown>>(record: T, volatile: Set<string>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (volatile.has(key) || value === undefined) continue;
    out[key] = value;
  }
  return out as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function signature(record: Record<string, unknown>, volatile: Set<string>): string {
  return JSON.stringify(stripVolatile(record, volatile));
}

function diffCollection<T extends { id: string }>(
  base: T[],
  current: T[],
  volatile: Set<string>,
): { before: T[]; after: T[] } {
  const baseById = new Map(base.map((item) => [item.id, item]));
  const currentById = new Map(current.map((item) => [item.id, item]));
  const before: T[] = [];
  const after: T[] = [];

  for (const item of base) {
    const counterpart = currentById.get(item.id);
    if (!counterpart) {
      before.push(clone(stripVolatile(item as Record<string, unknown>, volatile) as T));
      continue;
    }
    if (
      signature(item as Record<string, unknown>, volatile) !==
      signature(counterpart as Record<string, unknown>, volatile)
    ) {
      before.push(clone(stripVolatile(item as Record<string, unknown>, volatile) as T));
      after.push(clone(stripVolatile(counterpart as Record<string, unknown>, volatile) as T));
    }
  }
  for (const item of current) {
    if (!baseById.has(item.id)) {
      after.push(clone(stripVolatile(item as Record<string, unknown>, volatile) as T));
    }
  }
  return { before, after };
}

/** Diff two flow states into a history entry, or null when nothing changed. */
export function diffFlowState(base: FlowState, current: FlowState): HistoryEntry | null {
  const nodes = diffCollection(base.nodes, current.nodes, VOLATILE_NODE_FIELDS);
  const edges = diffCollection(base.edges, current.edges, VOLATILE_EDGE_FIELDS);
  if (
    nodes.before.length === 0 &&
    nodes.after.length === 0 &&
    edges.before.length === 0 &&
    edges.after.length === 0
  ) {
    return null;
  }
  return {
    nodesBefore: nodes.before,
    nodesAfter: nodes.after,
    edgesBefore: edges.before,
    edgesAfter: edges.after,
  };
}

function applyCollection<T extends { id: string }>(items: T[], restore: T[], discard: T[]): T[] {
  const restoreById = new Map(restore.map((item) => [item.id, item]));
  const discardIds = new Set(discard.map((item) => item.id));
  // Drop pure additions of the direction being reverted.
  let next = items.filter((item) => !(discardIds.has(item.id) && !restoreById.has(item.id)));
  // Restore changed items in place.
  const present = new Set(next.map((item) => item.id));
  next = next.map((item) => {
    const restored = restoreById.get(item.id);
    return restored ? clone(restored) : item;
  });
  // Re-add items that were removed in the direction being reverted.
  for (const item of restore) {
    if (!present.has(item.id)) next.push(clone(item));
  }
  return next;
}

/** Apply a history entry to a state: "undo" restores the before side, "redo" the after side. */
export function applyHistoryEntry(
  state: FlowState,
  entry: HistoryEntry,
  direction: "undo" | "redo",
): FlowState {
  const [restoreNodes, discardNodes] =
    direction === "undo"
      ? [entry.nodesBefore, entry.nodesAfter]
      : [entry.nodesAfter, entry.nodesBefore];
  const [restoreEdges, discardEdges] =
    direction === "undo"
      ? [entry.edgesBefore, entry.edgesAfter]
      : [entry.edgesAfter, entry.edgesBefore];

  return {
    // WHY sortParentsFirst: SvelteFlow requires parents before children; a
    // re-added container must land ahead of the children it re-adopts.
    nodes: sortParentsFirst(applyCollection(state.nodes, restoreNodes, discardNodes)),
    edges: applyCollection(state.edges, restoreEdges, discardEdges),
  };
}
