<script lang="ts">
// =========================
// IMPORTS
// =========================
import { NodeResizer, type NodeProps } from "@xyflow/svelte";
import ShapeOutline from "#src/components/shared/svg/ShapeOutline.svelte";
import PenField from "#src/pen/PenField.svelte";
import { getDiagramEditorContext } from "#src/editor/editor-context.js";
import { useHandDrawn } from "#src/editor/hand-context.js";
import { isLocked } from "#src/editor/lock.js";
import "#src/pen/pen.css";
import { penColorVar } from "#src/pen/colors.js";
import { shapeOutline } from "#src/pen/shapes.js";
import type { ShapeData } from "#src/pen/types.js";

// =========================
// PROPS
// =========================
let { id, data, selected, width, height }: NodeProps = $props();

// =========================
// STATE
// =========================
const editor = getDiagramEditorContext();
const handDrawn = useHandDrawn();
let endResize: (() => void) | null = null;

// =========================
// DERIVED
// =========================
let shape = $derived(data as ShapeData);
let outline = $derived(
	shapeOutline(shape.shape, width ?? 0, height ?? 0, shape.strokeWidth / 2),
);
let ink = $derived(penColorVar(shape.color));
</script>

<!-- =========================== -->
<!-- MARKUP -->
<!-- =========================== -->
<NodeResizer
	isVisible={selected}
	minWidth={24}
	minHeight={24}
	onResizeStart={() => {
		endResize = editor?.startGesture() ?? null;
	}}
	onResizeEnd={() => {
		endResize?.();
		endResize = null;
	}}
/>
<ShapeOutline {shape} {outline} {ink} {width} {height} hand={handDrawn()} seed={id} />
{#if shape.label || selected}
	<PenField
		variant="label"
		value={shape.label}
		readonly={!editor || isLocked({ data })}
		ariaLabel="Shape label"
		color={ink}
		onCommit={(next, live) => editor?.patchNodeData(id, { label: next }, live ? { coalesce: true } : undefined)}
		onExit={() => editor?.endTextEdit()}
	/>
{/if}
