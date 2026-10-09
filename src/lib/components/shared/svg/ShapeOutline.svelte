<script lang="ts">
// =========================
// IMPORTS
// =========================
import type { ShapeData } from "#src/pen/types.js";

// =========================
// TYPES
// =========================
interface Props {
	shape: ShapeData;
	outline: string;
	ink: string;
	width?: number;
	height?: number;
}

// =========================
// PROPS
// =========================
let { shape, outline, ink, width, height }: Props = $props();
</script>

<!-- =========================== -->
<!-- MARKUP -->
<!-- =========================== -->
<svg class="pen-shape" {width} {height} viewBox="0 0 {width} {height}" aria-hidden="true">
	<path
		d={outline}
		fill={shape.filled ? ink : "none"}
		fill-opacity={shape.filled ? 0.12 : 0}
		stroke={ink}
		stroke-width={shape.strokeWidth}
		stroke-linejoin="round"
		pointer-events={shape.filled ? "all" : "stroke"}
	/>
</svg>

<style>
	.pen-shape {
		display: block;
		overflow: visible;
		pointer-events: none;
	}
</style>
