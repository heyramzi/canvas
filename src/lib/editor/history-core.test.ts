import { expectDefined } from "#src/test-utils.js";
import { describe, expect, it } from "vitest";
import type { Node, Edge } from "@xyflow/svelte";
import { applyHistoryEntry, diffFlowState, type FlowState } from "#src/editor/history-core.js";

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "node",
    position: { x: 0, y: 0 },
    data: { label: id },
    ...overrides,
  } as Node;
}

function edge(id: string, source: string, target: string, overrides: Partial<Edge> = {}): Edge {
  return { id, source, target, ...overrides } as Edge;
}

function state(nodes: Node[], edges: Edge[] = []): FlowState {
  return { nodes, edges };
}

describe("diffFlowState", () => {
  it("returns null when nothing changed", () => {
    const a = state([node("a")], [edge("e", "a", "a")]);
    const b = state([node("a")], [edge("e", "a", "a")]);
    expect(diffFlowState(a, b)).toBeNull();
  });

  it("ignores volatile fields: selection is not an undo step", () => {
    const a = state([node("a")]);
    const b = state([node("a", { selected: true, dragging: true } as Partial<Node>)]);
    expect(diffFlowState(a, b)).toBeNull();
  });

  it("captures only affected items, not the whole document", () => {
    const untouched = node("keep");
    const a = state([untouched, node("move")]);
    const b = state([untouched, node("move", { position: { x: 100, y: 50 } })]);
    const entry = expectDefined(diffFlowState(a, b), "diff entry");
    expect(entry.nodesBefore.map((n) => n.id)).toEqual(["move"]);
    expect(entry.nodesAfter.map((n) => n.id)).toEqual(["move"]);
  });

  it("captures additions and removals", () => {
    const a = state([node("a")], [edge("e1", "a", "a")]);
    const b = state([node("b")], []);
    const entry = expectDefined(diffFlowState(a, b), "diff entry");
    expect(entry.nodesBefore.map((n) => n.id)).toEqual(["a"]);
    expect(entry.nodesAfter.map((n) => n.id)).toEqual(["b"]);
    expect(entry.edgesBefore.map((e) => e.id)).toEqual(["e1"]);
    expect(entry.edgesAfter).toEqual([]);
  });
});

describe("applyHistoryEntry", () => {
  it("undo restores a data edit, redo reapplies it", () => {
    const before = state([node("a", { data: { label: "old" } })]);
    const after = state([node("a", { data: { label: "new" } })]);
    const entry = expectDefined(diffFlowState(before, after), "diff entry");

    const undone = applyHistoryEntry(after, entry, "undo");
    expect(undone.nodes[0].data.label).toBe("old");

    const redone = applyHistoryEntry(undone, entry, "redo");
    expect(redone.nodes[0].data.label).toBe("new");
  });

  it("undo of a delete restores the node and its edges", () => {
    const before = state([node("a"), node("b")], [edge("e", "a", "b")]);
    const after = state([node("a")], []);
    const entry = expectDefined(diffFlowState(before, after), "diff entry");

    const undone = applyHistoryEntry(after, entry, "undo");
    expect(undone.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(undone.edges.map((e) => e.id)).toEqual(["e"]);
  });

  it("undo of an add removes the added node", () => {
    const before = state([node("a")]);
    const after = state([node("a"), node("b")]);
    const entry = expectDefined(diffFlowState(before, after), "diff entry");

    const undone = applyHistoryEntry(after, entry, "undo");
    expect(undone.nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("restores parents before children for SvelteFlow ordering", () => {
    const parent = node("parent");
    const child = node("child", { parentId: "parent" } as Partial<Node>);
    const before = state([parent, child]);
    const after = state([]);
    const entry = expectDefined(diffFlowState(before, after), "diff entry");

    const undone = applyHistoryEntry(after, entry, "undo");
    const ids = undone.nodes.map((n) => n.id);
    expect(ids.indexOf("parent")).toBeLessThan(ids.indexOf("child"));
  });

  it("round-trips a compound change (move + edit + add + remove)", () => {
    const before = state(
      [node("stay"), node("move"), node("gone", { data: { label: "bye" } })],
      [edge("e1", "stay", "move")],
    );
    const after = state(
      [
        node("stay"),
        node("move", { position: { x: 40, y: 40 }, data: { label: "moved" } }),
        node("fresh"),
      ],
      [edge("e1", "stay", "move", { label: "renamed" } as Partial<Edge>)],
    );
    const entry = expectDefined(diffFlowState(before, after), "diff entry");

    const undone = applyHistoryEntry(after, entry, "undo");
    expect(diffFlowState(before, undone)).toBeNull();

    const redone = applyHistoryEntry(undone, entry, "redo");
    expect(diffFlowState(after, redone)).toBeNull();
  });
});
