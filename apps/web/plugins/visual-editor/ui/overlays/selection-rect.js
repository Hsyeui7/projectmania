import { SELECTION_RECT_ID, isInsideEditorUi, getEditId } from '../../constants/selectors.js';
import { EDIT_BACKGROUND_COLOR, SELECTION_RECT_Z_INDEX, EDIT_BORDER_COLOR } from '../../constants/theme.js';
import { MIN_SELECTION_CANDIDATE_SIZE, MAX_SELECTED_ELEMENTS } from '../../constants/layout.js';
import { getAppRoot, getOpenModals } from '../../utils/dom-utils.js';
import { orderSelection } from '../../state/multi-select-state.js';

/** Set on `<body>` for the duration of a selection gesture, to keep the browser from painting text over it. */
export const NO_TEXT_SELECT_CLASS = 'selection-mode-no-text-select';

const SELECTION_RECT_STYLES = `
#${SELECTION_RECT_ID} {
	position: fixed;
	display: none;
	pointer-events: none;
	background: ${EDIT_BACKGROUND_COLOR};
	border: 1px solid ${EDIT_BORDER_COLOR};
	z-index: ${SELECTION_RECT_Z_INDEX};
}

body.${NO_TEXT_SELECT_CLASS}, body.${NO_TEXT_SELECT_CLASS} * {
	user-select: none !important;
}
`;

let _rectElement = null;
let _stylesInjected = false;

function ensureStyles() {
	if (_stylesInjected) return;
	const style = document.createElement('style');
	style.id = 'selection-rect-styles';
	style.textContent = SELECTION_RECT_STYLES;
	document.head.appendChild(style);
	_stylesInjected = true;
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/**
 * Normalises two drag corners into a viewport-space rect.
 * @returns {{x: number, y: number, w: number, h: number}}
 */
export function getSelectionRect(x1, y1, x2, y2) {
	return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

function intersects(bounds, rect) {
	return bounds.right > rect.x && bounds.left < rect.x + rect.w
		&& bounds.bottom > rect.y && bounds.top < rect.y + rect.h;
}

/* ------------------------------------------------------------------ *
 * Candidate resolution
 * ------------------------------------------------------------------ */

/**
 * True when the element is a plausible annotation target: visible, big enough to
 * aim at, and not part of the editor's own UI.
 * @param {HTMLElement} element
 * @param {DOMRect} bounds
 * @returns {boolean}
 */
function isSelectableCandidate(element, bounds) {
	if (bounds.width < MIN_SELECTION_CANDIDATE_SIZE || bounds.height < MIN_SELECTION_CANDIDATE_SIZE) return false;
	if (isInsideEditorUi(element)) return false;

	const styles = window.getComputedStyle(element);
	return styles.display !== 'none' && styles.visibility !== 'hidden';
}

/** Children the band also touches; an empty result means this element is as deep as it goes. */
function intersectingChildren(element, rect) {
	return Array.from(element.children).filter((child) => {
		const bounds = child.getBoundingClientRect();
		return isSelectableCandidate(child, bounds) && intersects(bounds, rect);
	});
}

/**
 * Everything the band touches, taking the deepest element on each branch so a
 * container never comes along with the children that made it a hit.
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @returns {HTMLElement[]} Document-ordered, with no member nested in another.
 */
export function collectSelection(rect) {
	const selected = [];
	const openModals = getOpenModals();
	const roots = openModals.length ? openModals : [getAppRoot()];
	const queue = roots.flatMap((root) => [...root.children]);

	while (queue.length && selected.length < MAX_SELECTED_ELEMENTS) {
		const element = queue.shift();
		const bounds = element.getBoundingClientRect();
		// No overlap prunes the whole subtree: children sit inside their parent's box.
		if (!isSelectableCandidate(element, bounds) || !intersects(bounds, rect)) continue;

		// An edit id marks the editor's own annotation target, so stop there rather
		// than splitting a button or heading into the spans it is built from.
		const children = getEditId(element) ? [] : intersectingChildren(element, rect);
		if (children.length) {
			queue.push(...children);
		} else {
			selected.push(element);
		}
	}

	return orderSelection(selected);
}

/* ------------------------------------------------------------------ *
 * Band rendering
 * ------------------------------------------------------------------ */

export function showSelectionRect(x1, y1, x2, y2) {
	if (!_rectElement) {
		ensureStyles();
		_rectElement = document.createElement('div');
		_rectElement.id = SELECTION_RECT_ID;
		document.body.appendChild(_rectElement);
	}
	if (!_rectElement.isConnected) document.body.appendChild(_rectElement);

	const rect = getSelectionRect(x1, y1, x2, y2);
	_rectElement.style.left = `${rect.x}px`;
	_rectElement.style.top = `${rect.y}px`;
	_rectElement.style.width = `${rect.w}px`;
	_rectElement.style.height = `${rect.h}px`;
	_rectElement.style.display = 'block';
}

export function hideSelectionRect() {
	if (_rectElement) _rectElement.style.display = 'none';
}

export function destroySelectionRect() {
	_rectElement?.remove();
	_rectElement = null;
}
