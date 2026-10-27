import { ANNOTATION_COLOR, PANEL_BG, PANEL_INPUT_BG, BORDER_COLOR, HOVER_BG, TEXT_MUTED, COLOR_WHITE, BUTTON_LIGHT_TEXT, BUTTON_LIGHT_BG_HOVER, BOX_SHADOW_TOOLBAR, SCROLLBAR_THUMB, SCROLLBAR_THUMB_HOVER } from '../../constants/theme.js';

export const ANNOTATION_PANEL_STYLES = `
	#selection-mode-annotation-panel {
		display: none;
		flex-direction: column;
		gap: 8px;
		position: fixed;
		background: ${PANEL_BG};
		border-radius: 16px;
		border: 1px solid ${BORDER_COLOR};
		padding: 8px;
		width: 320px;
		box-shadow: ${BOX_SHADOW_TOOLBAR};
		pointer-events: all;
		box-sizing: border-box;
		font-family: DM Sans, sans-serif;

		&.active {
			display: flex;
		}
	}

	#selection-mode-annotation-header {
		display: flex;
		align-items: center;
		gap: 16px;
		padding-left: 8px;
	}

	#selection-mode-annotation-count {
		flex: 1 0 0;
		min-width: 0;
		color: ${TEXT_MUTED};
		font-size: 14px;
		line-height: 20px;
		font-weight: 400;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	#selection-mode-annotation-input-wrapper {
		display: flex;
		flex-direction: column;
		background: ${PANEL_INPUT_BG};
		border: 1px solid ${BORDER_COLOR};
		border-radius: 8px;
		box-sizing: border-box;
		padding: 16px;
	}

	#selection-mode-annotation-textarea {
		width: 100%;
		min-height: 88px;
		max-height: 160px;
		background: transparent;
		border: none;
		outline: none;
		padding: 0 4px;
		color: ${COLOR_WHITE};
		font-size: 16px;
		font-family: inherit;
		resize: none;
		box-sizing: border-box;
		caret-color: ${COLOR_WHITE};
		line-height: 24px;
		overflow-y: auto;
	}

	#selection-mode-annotation-textarea::placeholder {
		color: ${TEXT_MUTED};
	}

	#selection-mode-annotation-buttons {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	/* Mirrors the chat file previews: chips scroll sideways instead of stacking into rows. */
	#selection-mode-annotation-attachments {
		display: none;
		overflow-x: auto;
		padding-top: 4px;
		margin-top: -4px;
		margin-bottom: 16px;
		scrollbar-width: thin;
		scrollbar-color: ${SCROLLBAR_THUMB} transparent;

		&.active {
			display: flex;
		}

		&::-webkit-scrollbar {
			height: 8px;
		}

		&::-webkit-scrollbar-track {
			background: transparent;
		}

		&::-webkit-scrollbar-thumb {
			background: ${SCROLLBAR_THUMB};
			border-radius: 999px;
			border: 2px solid transparent;
			background-clip: padding-box;
		}

		&::-webkit-scrollbar-thumb:hover {
			background: ${SCROLLBAR_THUMB_HOVER};
		}
	}

	.selection-mode-annotation-attachment {
		position: relative;
		display: inline-block;
		flex-shrink: 0;
		padding-right: 12px;
	}

	.selection-mode-annotation-attachment-thumb {
		width: 48px;
		height: 48px;
		border: 1px solid ${BORDER_COLOR};
		border-radius: 8px;
		object-fit: cover;
		cursor: pointer;
		user-select: none;
		display: block;
		box-sizing: border-box;
	}

	.selection-mode-annotation-attachment-remove {
		position: absolute;
		top: -4px;
		right: 8px;
		background: ${PANEL_BG};
		border: 1px solid ${BORDER_COLOR};
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
		color: ${COLOR_WHITE};

		& svg {
			width: 16px;
			height: 16px;
		}

		&:hover {
			background: ${BORDER_COLOR};
		}
	}

	#selection-mode-annotation-actions,
	#selection-mode-annotation-primary-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	/* Overrides the hover tooltip's fixed positioning; the id keeps this winning
	   no matter which of the two stylesheets is injected last. */
	#selection-mode-annotation-panel .selection-mode-button-tooltip {
		position: absolute;
	}

	#selection-mode-discard-btn,
	#selection-mode-attach-image-btn,
	#selection-mode-delete-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 8px;
		border-radius: 8px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	#selection-mode-discard-btn:hover,
	#selection-mode-attach-image-btn:hover:not(:disabled),
	#selection-mode-delete-btn:hover {
		background: ${HOVER_BG};
	}

	#selection-mode-attach-image-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	#selection-mode-attach-image-btn.is-loading:disabled {
		opacity: 1;
		cursor: wait;
	}

	/* Mirrors horizons-frontend Spinner.vue (w-4 border-1 border-light border-t-transparent, 2s spin). */
	.selection-mode-attach-spinner {
		box-sizing: border-box;
		width: 16px;
		height: 16px;
		border-radius: 9999px;
		border: 1px solid ${COLOR_WHITE};
		border-top-color: transparent;
		animation: selection-mode-attach-spin 2s linear infinite;
	}

	@keyframes selection-mode-attach-spin {
		to {
			transform: rotate(360deg);
		}
	}

	#selection-mode-delete-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		width: 32px;
		height: 32px;
	}

	#selection-mode-comment-btn {
		background: ${COLOR_WHITE};
		border: none;
		color: ${BUTTON_LIGHT_TEXT};
		font-family: inherit;
		font-size: 14px;
		line-height: 20px;
		font-weight: 600;
		cursor: pointer;
		padding: 6px 12px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		white-space: nowrap;
	}

	#selection-mode-comment-btn:hover {
		background: ${BUTTON_LIGHT_BG_HOVER};
	}

	#selection-mode-comment-btn:disabled {
		opacity: 0.2;
		cursor: not-allowed;
		background: ${COLOR_WHITE};
	}
`;

export const ANNOTATION_MARKER_STYLES = `
	.selection-mode-annotation-marker > * {
		pointer-events: none;
	}

	.selection-mode-annotation-marker {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: ${ANNOTATION_COLOR};
		border: 1px solid ${COLOR_WHITE}25;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: auto;
		cursor: pointer;
		user-select: none;
		transform: translate(-50%, -50%);
		transition: transform 0.15s ease;
	}

	.selection-mode-annotation-marker:hover,
	.selection-mode-annotation-marker.highlighted {
		transform: translate(-50%, -50%) scale(1.1);
	}
`;
