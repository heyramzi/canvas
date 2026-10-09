<script lang="ts">
// =========================
// IMPORTS
// =========================
import type { NodeProps } from "@xyflow/svelte";
import "#src/pen/pen.css";
import { penColorVar } from "#src/pen/colors.js";
import { strokePath } from "#src/pen/stroke-path.js";
import { HIGHLIGHTER_OPACITY, type StrokeData } from "#src/pen/types.js";

// =========================
// PROPS
// =========================
let { data, selected, width, height }: NodeProps = $props();

// =========================
// DERIVED
// =========================
let stroke = $derived(data as StrokeData);
let path = $derived(strokePath(stroke.points, stroke));
// A wide, invisible line along the centre so a thin stroke is easy to click.
let hitPoints = $derived(stroke.points.map((point) => `${point[0]},${point[1]}`).join(" "));
let hitWidth = $derived(Math.max(stroke.size, 14));
</script>

<!-- =========================== -->
<!-- MARKUP -->
<!-- =========================== -->
<svg
	class="pen-stroke"
	{width}
	{height}
	viewBox="0 0 {width} {height}"
	aria-hidden="true"
>
	<polyline
		class="hit"
		points={hitPoints}
		fill="none"
		stroke="transparent"
		stroke-width={hitWidth}
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
	<path
		class="ink"
		d={path}
		fill={penColorVar(stroke.color)}
		opacity={stroke.tool === "highlighter" ? HIGHLIGHTER_OPACITY : 1}
	/>
	{#if selected}
		<rect class="frame" x="1" y="1" width={Math.max((width ?? 2) - 2, 0)} height={Math.max((height ?? 2) - 2, 0)} />
	{/if}
</svg>

<style>
	.pen-stroke {
		display: block;
		overflow: visible;
		pointer-events: none;
	}
	.hit {
		pointer-events: stroke;
	}
	.ink {
		pointer-events: visiblePainted;
	}
	.frame {
		fill: none;
		stroke: var(--pen-blue, #1971c2);
		stroke-dasharray: 4 3;
		stroke-width: 1;
		pointer-events: none;
	}
</style>
