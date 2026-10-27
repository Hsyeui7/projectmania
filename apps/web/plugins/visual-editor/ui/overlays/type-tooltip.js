import { getElementType, elementZIndex } from '../../utils/dom-utils.js';
import { Z_OFFSET_TOOLTIP } from '../../constants/theme.js';
import { TYPE_TOOLTIP_CURSOR_OFFSET, TOOLTIP_VIEWPORT_MARGIN } from '../../constants/layout.js';
import { ELEMENT_TYPE_TRANSLATIONS } from '../../constants/selectors.js';
import { showHoverOutline, hideHoverOutline } from './hover-outline.js';
import { highlightMarkerForElement, unhighlightAllMarkers } from '../annotation-panel/annotation-markers.js';
import { getEditorTranslations } from '../../state/annotation-state.js';

const ELEMENT_TYPE_TOOLTIP_CLASS = 'element-type-tooltip';

let typeTooltipElement = null;
let displayedType = null;
let cachedWidth = 0;
let cachedHeight = 0;

function createTypeTooltip() {
	if (typeTooltipElement) return;
	typeTooltipElement = document.createElement('div');
	typeTooltipElement.className = ELEMENT_TYPE_TOOLTIP_CLASS;
	document.body.appendChild(typeTooltipElement);
}

/**
 * Positions the tooltip's top-left corner near `(clientX, clientY)`, clamped
 * per axis so it never crosses within `TOOLTIP_VIEWPORT_MARGIN` of the
 * viewport edge. The cursor is free to keep moving over the parked tooltip —
 * it is `pointer-events: none`, so hit-testing resolves straight through it.
 * @param {number} clientX
 * @param {number} clientY
 */
function positionAt(clientX, clientY) {
	const maxLeft = Math.max(TOOLTIP_VIEWPORT_MARGIN, window.innerWidth - cachedWidth - TOOLTIP_VIEWPORT_MARGIN);
	const maxTop = Math.max(TOOLTIP_VIEWPORT_MARGIN, window.innerHeight - cachedHeight - TOOLTIP_VIEWPORT_MARGIN);

	const left = Math.min(Math.max(clientX + TYPE_TOOLTIP_CURSOR_OFFSET, TOOLTIP_VIEWPORT_MARGIN), maxLeft);
	const top = Math.min(Math.max(clientY + TYPE_TOOLTIP_CURSOR_OFFSET, TOOLTIP_VIEWPORT_MARGIN), maxTop);

	typeTooltipElement.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

/**
 * Shows the type tooltip near the cursor, labelling `element`'s logical type.
 * @param {HTMLElement} element
 * @param {number} clientX
 * @param {number} clientY
 */
export function showTypeTooltip(element, clientX, clientY) {
	const type = getElementType(element);
	if (!typeTooltipElement) createTypeTooltip();
	if (!typeTooltipElement.isConnected) document.body.appendChild(typeTooltipElement);

	if (type !== displayedType) {
		displayedType = type;
		const translations = getEditorTranslations();
		const translationKey = ELEMENT_TYPE_TRANSLATIONS[type]?.key;
		typeTooltipElement.textContent = (translationKey && translations[translationKey]) || type;
		cachedWidth = typeTooltipElement.offsetWidth;
		cachedHeight = typeTooltipElement.offsetHeight;
	}

	typeTooltipElement.style.zIndex = elementZIndex(element) + Z_OFFSET_TOOLTIP;
	typeTooltipElement.classList.add('active');
	positionAt(clientX, clientY);
	showHoverOutline(element);
	unhighlightAllMarkers();
	highlightMarkerForElement(element);
}

/** Hides the type tooltip and its paired hover outline. */
export function hideTypeTooltip() {
	typeTooltipElement?.classList.remove('active');
	displayedType = null;
	hideHoverOutline();
	unhighlightAllMarkers();
}
