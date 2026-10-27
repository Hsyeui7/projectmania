/** CSS properties captured in DOM context payloads sent to the parent frame. */
export const IMPORTANT_STYLES = [
	'display',
	'position',
	'flex-direction',
	'justify-content',
	'align-items',
	'width',
	'height',
	'padding',
	'margin',
	'border',
	'background-color',
	'color',
	'font-size',
	'font-weight',
	'font-family',
	'border-radius',
	'box-shadow',
	'gap',
	'grid-template-columns',
];

/** Maps logical element types to tag names (lowercase HTML and PascalCase components). */
export const ELEMENT_TYPE_MAP = {
	text:   ['a', 'Link', 'p', 'span', 'time', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'Label', 'strong', 'em', 'b', 'i', 'u'],
	button: ['button', 'Button'],
	image:  ['img'],
};

/** Hover type tooltip label maps to its translation key and default English label. */
export const ELEMENT_TYPE_TRANSLATIONS = {
	text:   { key: 'elementTypeText', defaultLabel: 'Text' },
	button: { key: 'elementTypeButton', defaultLabel: 'Button' },
	image:  { key: 'elementTypeImage', defaultLabel: 'Image' },
	block:  { key: 'elementTypeBlock', defaultLabel: 'Block' },
};

/** Selector for ancestors that use fixed/sticky positioning (affects overlay coordinates). */
export const FIXED_CONTEXT_SELECTOR = 'nav, header, [style*="position: fixed"], [style*="position:fixed"], [style*="position: sticky"], [style*="position:sticky"]';

/** CSS selector matching the floating text-format toolbar and its action panels. */
export const TOOLBAR_UI_SELECTOR = '#text-format-toolbar, #text-format-link-action, #text-format-size-action, #text-format-font-action, #text-format-color-action';

/** DOM id of the drag-select band drawn while rubber-band selecting. */
export const SELECTION_RECT_ID = 'selection-mode-select-rect';

/** CSS selector matching the annotation panel, its pin markers and the drag-select band. */
export const ANNOTATION_UI_SELECTOR = `#selection-mode-annotation-panel, .selection-mode-annotation-marker, #${SELECTION_RECT_ID}`;

/** All floating editor UI (toolbar, annotation panel, pin markers). */
export const EDITOR_UI_SELECTOR = `${TOOLBAR_UI_SELECTOR}, ${ANNOTATION_UI_SELECTOR}`;

/** CSS selector matching any editable target (static or assisted). */
export const EDIT_TARGET_SELECTOR = '[data-edit-id], [data-edit-assisted-id]';

/**
 * Returns whichever edit-id attribute is present on the element.
 * @param {HTMLElement} element
 * @returns {string|null}
 */
export function getEditId(element) {
	return element?.getAttribute('data-edit-id') || element?.getAttribute('data-edit-assisted-id') || null;
}

/** Selector for actionable elements (pointer-events disabled in edit mode, see `EDIT_MODE_STYLES`). */
export const ACTIONABLE_SELECTOR = 'a[href], button, [role="button"], [type="submit"]';

/**
 * True while edit mode is active on the app root.
 * @returns {boolean}
 */
export function isEditModeEnabled() {
	return document.getElementById('root')?.getAttribute('data-edit-mode-enabled') === 'true';
}

/**
 * True when the event target sits inside any floating editor UI (toolbar or action panels).
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isInsideEditorUi(target) {
	return !!target?.closest?.(EDITOR_UI_SELECTOR);
}
