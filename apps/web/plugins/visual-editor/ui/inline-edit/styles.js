import { EDIT_BORDER_COLOR, EDIT_BACKGROUND_COLOR, PANEL_BG, BORDER_COLOR, COLOR_WHITE } from '../../constants/theme.js';
import { ICON_TEXT_EDIT_CURSOR } from '../../constants/icons.js';
import { HOVER_OUTLINE_STROKE_WIDTH } from '../../constants/layout.js';
import { EDITOR_UI_SELECTOR } from '../../constants/selectors.js';

/** Injected CSS for edit-mode hover outlines, contenteditable affordances, and the element-type tooltip. */
export const EDIT_MODE_STYLES = `
	#root[data-edit-mode-enabled="true"] [data-edit-id],
	#root[data-edit-mode-enabled="true"] [data-edit-assisted-id] {
		cursor: default !important;
		overflow-wrap: anywhere;
	}
	#root[data-edit-mode-enabled="true"] [data-edit-id][contenteditable="true"],
	#root[data-edit-mode-enabled="true"] [data-edit-assisted-id][contenteditable="true"] {
		outline: 1px solid ${EDIT_BORDER_COLOR};
		caret-color: currentColor;
		user-select: text;
		-webkit-user-select: text;
		cursor: url('data:image/svg+xml,${ICON_TEXT_EDIT_CURSOR}') 12 12, text !important;
	}
	#root[data-edit-mode-enabled="true"] [data-edit-id][contenteditable="true"] *,
	#root[data-edit-mode-enabled="true"] [data-edit-assisted-id][contenteditable="true"] * {
		cursor: url('data:image/svg+xml,${ICON_TEXT_EDIT_CURSOR}') 12 12, text !important;
	}

	/* Suppress native cursor on actionable elements while editing. */
	#root[data-edit-mode-enabled="true"] a,
	#root[data-edit-mode-enabled="true"] button,
	#root[data-edit-mode-enabled="true"] [role="button"],
	#root[data-edit-mode-enabled="true"] [type="submit"] {
		cursor: default !important;
	}

	.inline-editor-hover-outline,
	.inline-editor-locked-outline {
		outline-offset: -${HOVER_OUTLINE_STROKE_WIDTH}px;
		box-shadow: inset 0 0 0 999px ${EDIT_BACKGROUND_COLOR};
	}

	.inline-editor-hover-outline {
		outline: ${HOVER_OUTLINE_STROKE_WIDTH}px dashed ${EDIT_BORDER_COLOR};
	}

	.inline-editor-locked-outline {
		outline: ${HOVER_OUTLINE_STROKE_WIDTH}px solid ${EDIT_BORDER_COLOR};
	}

	@keyframes element-type-tooltip-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.element-type-tooltip {
		display: none;
		opacity: 0;
		position: fixed;
		top: 0;
		left: 0;
		background-color: ${PANEL_BG};
		color: ${COLOR_WHITE};
		padding: 0 4px;
		border-radius: 6px;
		font-family: DM Sans, sans-serif;
		font-size: 12px;
		font-weight: 400;
		line-height: 20px;
		border: 1px solid ${BORDER_COLOR};
		pointer-events: none;
		white-space: nowrap;
	}

	.element-type-tooltip.active {
		display: block;
		animation: element-type-tooltip-fade-in 0.2s ease-out forwards;
	}

	${EDITOR_UI_SELECTOR} {
		pointer-events: auto;
	}
`;
