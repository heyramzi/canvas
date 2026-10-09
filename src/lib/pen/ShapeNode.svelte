<script lang="ts">
// =========================
// IMPORTS
// =========================
import { NodeResizer, type NodeProps } from "@xyflow/svelte";
import ShapeOutline from "#src/components/shared/svg/ShapeOutline.svelte";
import { getDiagramEditorContext } from "#src/editor/editor-context.js";
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
<ShapeOutline {shape} {outline} {ink} {width} {height} />
{#if shape.label || selected}
	<textarea
		class="label nodrag"
		rows="1"
		value={shape.label}
		readonly={!editor}
		aria-label="Shape label"
		style:color={ink}
		oninput={(event) => editor?.patchNodeData(id, { label: event.currentTarget.value })}
		onkeydown={(event) => {
			event.stopPropagation();
			if (event.key === "Escape") event.currentTarget.blur();
		}}
	></textarea>
{/if}

<style>
	.label {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		field-sizing: content;
		min-width: 2ch;
		max-width: 80%;
		margin: 0;
		padding: 2px 4px;
		border: 0;
		background: transparent;
		font: inherit;
		font-weight: 500;
		text-align: center;
		resize: none;
		outline: none;
		pointer-events: auto;
	}
</style>
