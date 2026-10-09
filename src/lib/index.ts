// @heyramzi/canvas public API. Server-safe: nothing here touches the DOM.
// Svelte components are imported by path, like "@heyramzi/canvas/ui/canvas-grid.svelte".

export * from "#src/types.js";
export * from "#src/plugin.js";
export { tryCatch, tryCatchAsync, type Result } from "#src/result.js";

export * from "#src/ops/ops.js";

export * from "#src/headless/alignment.js";
export * from "#src/headless/canvas-cleanup.js";
export * from "#src/headless/edge-anchors.js";
export * from "#src/headless/edge-serialization.js";
export * from "#src/headless/fit-viewport.js";
export * from "#src/headless/grid.js";
export * from "#src/headless/icon-node.js";
export * from "#src/headless/linkify.js";
export * from "#src/headless/sketch.js";
export * from "#src/headless/snap-guides.js";
export * from "#src/headless/svg-figure.js";
export * from "#src/headless/table-layout.js";

export {
  resolveContextMenuHit,
  type ContextMenuHit,
  type TableCellHit,
} from "#src/editor/context-menu.js";
export * from "#src/editor/editor-context.js";
export * from "#src/editor/dispatch.svelte.js";
export * from "#src/editor/editor-mode.js";
export * from "#src/editor/history-core.js";
export * from "#src/editor/keymap.js";
export * from "#src/editor/layout-actions.js";
export * from "#src/editor/rebase.js";
