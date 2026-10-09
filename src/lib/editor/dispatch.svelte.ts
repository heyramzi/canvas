// The single write path for diagram mutations. Every edit, from any source, is
// one transaction: a before/after history entry, then dirty and autosave.

// Undo and redo replay those entries.

import type { Node, Edge } from "@xyflow/svelte";
import { applyOps, type CanvasOp } from "#src/ops/ops.js";
import type { OpDefinition, OpLike } from "#src/plugin.js";
import { tryCatch } from "#src/result.js";
import {
  applyHistoryEntry,
  diffFlowState,
  type FlowState,
  type HistoryEntry,
} from "#src/editor/history-core.js";

const MAX_ENTRIES = 100;

export type CanvasDispatcher<Op extends OpLike = CanvasOp> = ReturnType<
  typeof createCanvasDispatcher<Op>
>;

/** `Op` is the union of op shapes the caller dispatches: the canvas's own plus its plugins'. */
export function createCanvasDispatcher<Op extends OpLike = CanvasOp>(io: {
  getState: () => FlowState;
  setState: (state: FlowState) => void;
  /** Called after every state-changing commit, undo and redo. */
  onMutated: () => void;
  /** The op kinds beyond the canvas's own, from the app's plugins. */
  opDefinitions?: readonly OpDefinition[];
}) {
  let undoStack = $state.raw<HistoryEntry[]>([]);
  let redoStack = $state.raw<HistoryEntry[]>([]);
  let depth = 0;
  let baseline: FlowState | null = null;

  function snapshot(): FlowState {
    const state = io.getState();
    return JSON.parse(JSON.stringify({ nodes: state.nodes, edges: state.edges })) as FlowState;
  }

  /** Open a transaction. Nested calls join the outermost one. */
  function begin() {
    if (depth === 0) baseline = snapshot();
    depth += 1;
  }

  /** Close a transaction. The outermost close diffs and records the entry. */
  function commit() {
    depth = Math.max(0, depth - 1);
    if (depth > 0 || !baseline) return;
    const entry = diffFlowState(baseline, io.getState());
    baseline = null;
    if (!entry) return;
    undoStack = [...undoStack.slice(-(MAX_ENTRIES - 1)), entry];
    redoStack = [];
    io.onMutated();
  }

  function run<T>(fn: () => T): T {
    begin();
    const res = tryCatch(fn);
    commit();
    if (!res.ok) throw res.error;
    return res.value;
  }

  /** Apply granular ops to the flow state inside a transaction. */
  function dispatch(ops: Op | Op[]): boolean {
    const list = Array.isArray(ops) ? ops : [ops];
    if (list.length === 0) return true;
    return run(() => {
      const state = io.getState();
      const res = tryCatch(() =>
        applyOps(
          {
            // `applyOps` patches plain records so one op log replays over xyflow
            // and persisted shapes. Widening in and narrowing out is that seam.
            nodes: state.nodes as Record<string, unknown>[],
            edges: state.edges as Record<string, unknown>[],
          },
          list,
          io.opDefinitions,
        ),
      );
      if (!res.ok) return false;
      io.setState({
        nodes: res.value.nodes as unknown as Node[],
        edges: res.value.edges as unknown as Edge[],
      });
      return true;
    });
  }

  // An open gesture owns the baseline, so a replay under it would fold into its entry.
  function undo() {
    const entry = undoStack.at(-1);
    if (!entry || depth > 0) return;
    undoStack = undoStack.slice(0, -1);
    redoStack = [...redoStack, entry];
    io.setState(applyHistoryEntry(io.getState(), entry, "undo"));
    io.onMutated();
  }

  function redo() {
    const entry = redoStack.at(-1);
    if (!entry || depth > 0) return;
    redoStack = redoStack.slice(0, -1);
    undoStack = [...undoStack, entry];
    io.setState(applyHistoryEntry(io.getState(), entry, "redo"));
    io.onMutated();
  }

  return {
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    begin,
    commit,
    run,
    dispatch,
    undo,
    redo,
    clear() {
      undoStack = [];
      redoStack = [];
    },
  };
}
