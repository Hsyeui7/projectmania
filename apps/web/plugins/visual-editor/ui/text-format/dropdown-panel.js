/**
 * Shared lifecycle helpers for the toolbar dropdown action panels
 * (size, font, link, color): DOM bootstrapping, positioning relative to the
 * toolbar, and outside-interaction dismissal.
 */
import { PANEL_GAP, PANEL_MARGIN, PARENT_TOOLBAR_HEIGHT } from '../../constants/layout.js';
import { isolateEditorUiEvents } from '../../utils/dom-utils.js';
import { Z_OFFSET_DROPDOWN, Z_OFFSET_TOOLBAR } from '../../constants/theme.js';
import { getToolbarEl } from './toolbar/toolbar.js';

/**
 * Injects the panel stylesheet (once) and mounts the panel root element.
 * @param {{ styleId: string, styles: string, html: string }} config
 * @returns {HTMLElement} The mounted panel root.
 */
export function createPanelElement({ styleId, styles, html }) {
	if (!document.getElementById(styleId)) {
		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = styles;
		document.head.appendChild(style);
	}
	const wrapper = document.createElement('div');
	wrapper.innerHTML = html;
	const element = wrapper.firstElementChild;
	document.body.appendChild(element);
	isolateEditorUiEvents(element);
	return element;
}

/**
 * Positions a dropdown panel below (or above) the toolbar, left-aligned to its
 * trigger button and clamped to the viewport.
 * @param {HTMLElement} element - Panel root.
 * @param {{ buttonAction?: string|null, matchToolbarWidth?: boolean }} [options]
 */
export function positionDropdownPanel(element, { buttonAction = null, matchToolbarWidth = false } = {}) {
	const toolbarElement = getToolbarEl();
	if (!toolbarElement || !element) return;

	const toolbarBounds = toolbarElement.getBoundingClientRect();
	if (matchToolbarWidth) element.style.width = `${toolbarBounds.width}px`;

	const button = buttonAction ? toolbarElement.querySelector(`[data-action="${buttonAction}"]`) : null;
	const anchorBounds = button ? button.getBoundingClientRect() : toolbarBounds;
	const panelWidth = matchToolbarWidth ? toolbarBounds.width : element.offsetWidth;
	const panelHeight = element.offsetHeight;

	const spaceBelow = window.innerHeight - PARENT_TOOLBAR_HEIGHT - toolbarBounds.bottom;
	const top = Math.max(PANEL_MARGIN, spaceBelow >= panelHeight + PANEL_GAP
		? toolbarBounds.bottom + PANEL_GAP
		: toolbarBounds.top - panelHeight - PANEL_GAP);

	const left = Math.max(PANEL_MARGIN, Math.min(anchorBounds.left, window.innerWidth - panelWidth - PANEL_MARGIN));

	element.style.left = `${left}px`;
	element.style.top = `${top}px`;
	// Stacked from the toolbar's own level so the dropdown follows the toolbar
	// under (or above) the site's chrome instead of escaping to a top layer.
	const toolbarZIndex = parseInt(toolbarElement.style.zIndex, 10);
	element.style.zIndex = (Number.isNaN(toolbarZIndex) ? Z_OFFSET_TOOLBAR : toolbarZIndex) - Z_OFFSET_TOOLBAR + Z_OFFSET_DROPDOWN;
}

/**
 * Builds attach/detach-able listeners that dismiss a panel on outside
 * mousedown.
 * @param {{
 *   getElement: () => HTMLElement|null,
 *   dismiss: () => void,
 *   ignoreToolbar?: boolean,
 *   ignoreMouseDown?: ((event: MouseEvent) => boolean)|null,
 *   captureMouseDown?: boolean,
 * }} config
 * @returns {{ attach: () => void, detach: () => void }}
 */
export function createOutsideDismiss({ getElement, dismiss, ignoreToolbar = true, ignoreMouseDown = null, captureMouseDown = false }) {
	function onMouseDown(event) {
		if (getElement()?.contains(event.target)) return;
		if (ignoreToolbar && getToolbarEl()?.contains(event.target)) return;
		if (ignoreMouseDown?.(event)) return;
		dismiss();
	}
	return {
		attach() {
			document.addEventListener('mousedown', onMouseDown, captureMouseDown);
		},
		detach() {
			document.removeEventListener('mousedown', onMouseDown, captureMouseDown);
		},
	};
}

/**
 * @returns {Range|null} Clone of the current selection range, if any.
 */
export function captureSelectionRange() {
	const selection = window.getSelection();
	return selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
}
