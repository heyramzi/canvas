import { expectDefined } from "#src/test-utils.js";
import { describe, expect, it } from "vitest";
import { applyOps } from "#src/ops/ops.js";
import { diffToOps, rebaseDiagram, type DiagramDoc } from "#src/editor/rebase.js";

function doc(nodes: DiagramDoc["nodes"], edges: DiagramDoc["edges"] = []): DiagramDoc {
  return { nodes, edges };
}

function n(id: string, overrides: Record<string, unknown> = {}): DiagramDoc["nodes"][number] {
  return { id, type: "node", position: { x: 0, y: 0 }, data: { label: id }, ...overrides };
}

describe("diffToOps", () => {
  it("returns no ops for identical docs", () => {
    expect(diffToOps(doc([n("a")]), doc([n("a")]))).toEqual([]);
  });

  it("replaying the diff on the base reproduces the current doc", () => {
    const base = doc(
      [n("stay"), n("move"), n("gone"), n("container", { type: "space" })],
      [{ id: "e1", source: "stay", target: "move" }],
    );
    const current = doc(
      [
        n("stay"),
        n("move", { position: { x: 120, y: 80 }, data: { label: "renamed" } }),
        n("container", { type: "space", style: { width: 400, height: 300 } }),
        n("child", { parentId: "container", position: { x: 20, y: 60 } }),
      ],
      [
        { id: "e1", source: "stay", target: "move", label: "flows" },
        { id: "e2", source: "stay", target: "child" },
      ],
    );

    const ops = diffToOps(base, current);
    const replayed = applyOps({ nodes: base.nodes, edges: base.edges }, ops);

    const byId = new Map(replayed.nodes.map((node) => [node.id, node]));
    expect(byId.has("gone")).toBe(false);
    expect(byId.get("move")?.position).toEqual({ x: 120, y: 80 });
    expect(
      (expectDefined(byId.get("move"), "entry move").data as Record<string, unknown>).label,
    ).toBe("renamed");
    expect(byId.get("container")?.style).toEqual({ width: 400, height: 300 });
    expect(byId.get("child")?.parentId).toBe("container");
    // parentId implies extent at the op seam
    expect(byId.get("child")?.extent).toBe("parent");
    const edgeById = new Map(replayed.edges.map((edge) => [edge.id, edge]));
    expect(edgeById.get("e1")?.label).toBe("flows");
    expect(edgeById.has("e2")).toBe(true);
  });

  it("orders added parents before added children", () => {
    const base = doc([]);
    const current = doc([
      n("child", { parentId: "parent", position: { x: 10, y: 10 } }),
      n("parent", { type: "space" }),
    ]);
    // Would throw "Unknown parentId" if the child op ran first.
    const replayed = applyOps({ nodes: [], edges: [] }, diffToOps(base, current));
    expect(replayed.nodes).toHaveLength(2);
  });
});

describe("rebaseDiagram", () => {
  const lastSaved = doc([n("a"), n("b")]);

  it("replays local changes on top of the server doc", () => {
    // Server: an agent added "agent-node". Local: the user renamed "a".
    const serverDoc = doc([n("a"), n("b"), n("agent-node")]);
    const local = doc([n("a", { data: { label: "renamed" } }), n("b")]);

    const rebased = expectDefined(rebaseDiagram(serverDoc, lastSaved, local), "rebased doc");
    const byId = new Map(rebased.nodes.map((node) => [node.id, node]));
    expect(byId.has("agent-node")).toBe(true);
    expect((expectDefined(byId.get("a"), "entry a").data as Record<string, unknown>).label).toBe(
      "renamed",
    );
  });

  it("returns the server doc unchanged when there are no local changes", () => {
    const serverDoc = doc([n("a"), n("b"), n("agent-node")]);
    const rebased = expectDefined(rebaseDiagram(serverDoc, lastSaved, lastSaved), "rebased doc");
    expect(rebased.nodes.map((node) => node.id)).toEqual(["a", "b", "agent-node"]);
  });

  it("returns null when the replay is impossible", () => {
    // Server deleted "b"; local patched it. patchNode on a missing node throws.
    const serverDoc = doc([n("a")]);
    const local = doc([n("a"), n("b", { data: { label: "edited" } })]);
    expect(rebaseDiagram(serverDoc, lastSaved, local)).toBeNull();
  });
});
