<script lang="ts" module>
import type { PenColor } from "#src/pen/types.js";
import type { CanvasTool } from "#src/ui/tools.js";

export interface ToolbarLabels {
	toolbar: string;
	style: string;
	tools: Record<CanvasTool, string> & { shapes: string };
	colors: Record<PenColor, string>;
	/** Small, medium, large. */
	sizes: readonly [string, string, string];
	undo: string;
	redo: string;
}
</script>

<script lang="ts">
// =========================
// IMPORTS
// =========================
import { Panel } from "@xyflow/svelte";
import type { Snippet } from "svelte";
import "#src/pen/pen.css";
import { PEN_COLORS } from "#src/pen/types.js";
import "#src/ui/canvas-ui.css";
import ToolIcon from "#src/components/icons/ToolIcon.svelte";
import {
	hasBrush,
	hasColor,
	isShapeTool,
	keyForTool,
	type BrushLevel,
} from "#src/ui/tools.js";

// =========================
// TYPES
// =========================
interface Props {
	tool: CanvasTool;
	color: PenColor;
	level: BrushLevel;
	labels: ToolbarLabels;
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	/** Sits above the bar, for the selection actions. */
	above?: Snippet;
	/** Sits after undo and redo, for what only the host knows, like the card palette. */
	extra?: Snippet;
}

// =========================
// PROPS
// =========================
let {
	tool = $bindable(),
	color = $bindable(),
	level = $bindable(),
	labels,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	above,
	extra,
}: Props = $props();

// =========================
// STATE
// =========================
let lastShape = $state<"rectangle" | "ellipse" | "diamond">("rectangle");

// =========================
// DERIVED
// =========================
const MAIN_TOOLS = ["select", "hand", "pen", "highlighter", "eraser", "text"] as const;
const SHAPES = ["rectangle", "ellipse", "diamond"] as const;
const BRUSH_DOT = [4, 7, 11] as const;

let shapeActive = $derived(isShapeTool(tool));
let showStyle = $derived(hasColor(tool));

// =========================
// EFFECTS
// =========================
$effect(() => {
	if (isShapeTool(tool)) lastShape = tool;
});

// =========================
// FUNCTIONS
// =========================
function tip(id: CanvasTool): string {
	const key = keyForTool(id);
	return key ? `${labels.tools[id]}  ${key}` : labels.tools[id];
}
</script>

<!-- =========================== -->
<!-- MARKUP -->
<!-- =========================== -->
<Panel position="bottom-center" class="cv-dock">
	<div class="cv-stack">
		{@render above?.()}

		{#if showStyle}
			<div class="cv-bar cv-style" role="toolbar" aria-label={labels.style}>
				{#if shapeActive}
					{#each SHAPES as shape (shape)}
						<button
							type="button"
							class="cv-btn"
							aria-pressed={tool === shape}
							aria-label={labels.tools[shape]}
							data-tip={tip(shape)}
							onclick={() => (tool = shape)}
						>
							<ToolIcon name={shape} size={18} />
						</button>
					{/each}
					<span class="cv-sep" aria-hidden="true"></span>
				{/if}

				{#each PEN_COLORS as swatch (swatch)}
					<button
						type="button"
						class="cv-swatch"
						aria-pressed={color === swatch}
						aria-label={labels.colors[swatch]}
						data-tip={labels.colors[swatch]}
						style:--swatch="var(--pen-{swatch})"
						onclick={() => (color = swatch)}
					></button>
				{/each}

				{#if hasBrush(tool)}
					<span class="cv-sep" aria-hidden="true"></span>
					{#each BRUSH_DOT as dot, index (index)}
						<button
							type="button"
							class="cv-btn cv-size"
							aria-pressed={level === index}
							aria-label={labels.sizes[index]}
							data-tip={labels.sizes[index]}
							onclick={() => (level = index as BrushLevel)}
						>
							<span class="cv-dot" style:--dot="{dot}px"></span>
						</button>
					{/each}
				{/if}
			</div>
		{/if}

		<div class="cv-bar" role="toolbar" aria-label={labels.toolbar}>
			{#each MAIN_TOOLS as id (id)}
				<button
					type="button"
					class="cv-btn"
					class:cv-hide-narrow={id === "hand"}
					aria-pressed={tool === id}
					aria-label={labels.tools[id]}
					data-tip={tip(id)}
					onclick={() => (tool = id)}
				>
					<ToolIcon name={id} />
				</button>
			{/each}
			<button
				type="button"
				class="cv-btn"
				aria-pressed={shapeActive}
				aria-label={labels.tools.shapes}
				data-tip={labels.tools.shapes}
				onclick={() => (tool = lastShape)}
			>
				<ToolIcon name={isShapeTool(tool) ? tool : lastShape} />
			</button>

			<span class="cv-sep" aria-hidden="true"></span>

			<button type="button" class="cv-btn" aria-label={labels.undo} data-tip={labels.undo} disabled={!canUndo} onclick={onUndo}>
				<ToolIcon name="undo" />
			</button>
			<button type="button" class="cv-btn" aria-label={labels.redo} data-tip={labels.redo} disabled={!canRedo} onclick={onRedo}>
				<ToolIcon name="redo" />
			</button>

			{#if extra}
				<span class="cv-sep" aria-hidden="true"></span>
				{@render extra()}
			{/if}
		</div>
	</div>
</Panel>
