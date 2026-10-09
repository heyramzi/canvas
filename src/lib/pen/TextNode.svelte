<script lang="ts">
// =========================
// IMPORTS
// =========================
import type { NodeProps } from "@xyflow/svelte";
import { onMount } from "svelte";
import { getDiagramEditorContext } from "#src/editor/editor-context.js";
import "#src/pen/pen.css";
import { penColorVar } from "#src/pen/colors.js";
import type { TextData } from "#src/pen/types.js";

// =========================
// PROPS
// =========================
let { id, data, selected }: NodeProps = $props();

// =========================
// STATE
// =========================
const editor = getDiagramEditorContext();
let field = $state<HTMLTextAreaElement>();

// =========================
// DERIVED
// =========================
let text = $derived(data as TextData);

// =========================
// EFFECTS
// =========================
// The editor asks a freshly dropped text to open, so the first thing typed lands in it.
onMount(() => editor?.registerStartEdit(id, () => field?.focus()));

// =========================
// FUNCTIONS
// =========================
function onblur() {
	// A click that typed nothing leaves no empty node behind.
	if (editor && text.text.trim() === "") editor.removeNode(id);
}
</script>

<!-- =========================== -->
<!-- MARKUP -->
<!-- =========================== -->
<textarea
	bind:this={field}
	class="pen-text nodrag"
	class:selected
	rows="1"
	value={text.text}
	readonly={!editor}
	aria-label="Text"
	style:color={penColorVar(text.color)}
	style:font-size="{text.fontSize}px"
	oninput={(event) => editor?.patchNodeData(id, { text: event.currentTarget.value })}
	onkeydown={(event) => {
		// Typing must never reach the canvas shortcuts, where Delete would remove the node.
		event.stopPropagation();
		if (event.key === "Escape") event.currentTarget.blur();
	}}
	{onblur}
></textarea>

<style>
	.pen-text {
		display: block;
		field-sizing: content;
		min-width: 2ch;
		max-width: 480px;
		margin: 0;
		padding: 2px 4px;
		border: 0;
		border-radius: 4px;
		outline: 1px dashed transparent;
		background: transparent;
		font: inherit;
		font-weight: 500;
		line-height: 1.4;
		resize: none;
	}
	.pen-text.selected,
	.pen-text:focus {
		outline-color: var(--pen-blue, #1971c2);
	}
</style>
