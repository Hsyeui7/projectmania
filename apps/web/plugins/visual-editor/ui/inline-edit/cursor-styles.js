import { getEditing } from "../../state/editing-state.js";
import { stopFontSizeEdit, updateTextFormatToolbar, scheduleRepositionEditOverlays } from "../text-format/toolbar/toolbar.js";
import { hideAllPanels } from "../../state/panel-state.js";
import { resolveInlineStylesAtRange } from "../../utils/inline-style-state.js";
import { EDITOR_UI_SELECTOR } from "../../constants/selectors.js";

/**
 * @param {HTMLElement} element
 * @param {HTMLElement} container
 * @returns {{ value: string, isGradient: boolean }}
 */
function resolveTextColor(element, container) {
	const color = getComputedStyle(element).color;

	if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
		return { value: color, isGradient: false };
	}

	let current = element;
	while (current && current !== container.parentElement) {
		const computedStyle = getComputedStyle(current);
		const backgroundImage = computedStyle.backgroundImage;
		const backgroundClip = computedStyle.backgroundClip || computedStyle['webkitBackgroundClip'];

		if (backgroundImage && backgroundImage !== 'none' && backgroundImage.includes('gradient') && backgroundClip === 'text') {
			return { value: backgroundImage, isGradient: true };
		}
		current = current.parentElement;
	}

	return { value: color, isGradient: false };
}

/**
 * Resolves caret/selection presentation state for the formatting toolbar.
 * Bold, italic, and underline are detected independently via ancestor walks
 * so nested markup (`<em><u><strong>…</strong></u></em>`) reports all active styles.
 * @returns {object|null}
 */
export function getStylesAtCursor() {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;

	const range = selection.getRangeAt(0);
	let node = range.startContainer;

	if (node.nodeType === Node.ELEMENT_NODE) {
		const child = node.childNodes[range.startOffset];
		if (child) node = child;
	}

	if (node.nodeType === Node.TEXT_NODE) {
		node = node.parentElement;
	}

	if (!node || node.nodeType !== Node.ELEMENT_NODE) {
		node = getEditing()?.targetElement;
	}

	if (!node) return null;

	const container = getEditing()?.targetElement || node;
	const presentation = resolveInlineStylesAtRange(range, container);
	const styles = getComputedStyle(node);
	const containerStyles = getComputedStyle(container);
	const resolvedColor = resolveTextColor(node, container);

	return {
		color: resolvedColor.value,
		isGradient: resolvedColor.isGradient,
		fontFamily: styles.fontFamily,
		fontSize: styles.fontSize,
		textAlign: containerStyles.textAlign,
		...presentation,
	};
}

/** Updates toolbar and parent when the selection moves during inline edit. */
export function onSelectionChange(force = false) {
	const editing = getEditing();
	if (!editing?.targetElement?.hasAttribute("contenteditable")) return;
	if (!force && document.activeElement?.closest(EDITOR_UI_SELECTOR)) return;
	const selection = window.getSelection();
	if (selection && selection.rangeCount > 0 && !editing.targetElement.contains(selection.getRangeAt(0).commonAncestorContainer)) {
		return;
	}
	stopFontSizeEdit();
	hideAllPanels();
	const styles = getStylesAtCursor();
	if (!styles) return;
	updateTextFormatToolbar(styles);
	scheduleRepositionEditOverlays();
}
