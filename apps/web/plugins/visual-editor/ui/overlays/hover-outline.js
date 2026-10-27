export const HOVER_OUTLINE_CLASS = 'inline-editor-hover-outline';
export const LOCKED_OUTLINE_CLASS = 'inline-editor-locked-outline';

/** @param {HTMLElement|HTMLElement[]|null} value @returns {HTMLElement[]} */
function toArray(value) {
	if (!value) return [];
	return Array.isArray(value) ? value.filter(Boolean) : [value];
}

/** @param {HTMLElement[]} elements @param {string} className */
function addClassTo(elements, className) {
	for (const element of elements) element.classList.add(className);
}

/** @param {HTMLElement[]} elements @param {string} className */
function removeClassFrom(elements, className) {
	for (const element of elements) element.classList.remove(className);
}

/** @type {HTMLElement[]} */
let _hoveredElements = [];
/** @type {HTMLElement[]} */
let _lockedElements = [];
let _holdCount = 0;

/**
 * Dashed outline for the transient hover. Elements already carrying a locked
 * outline are skipped so they aren't outlined twice.
 * @param {HTMLElement|HTMLElement[]} elements
 */
export function showHoverOutline(elements) {
	const targets = toArray(elements).filter(element => !_lockedElements.includes(element));
	if (!targets.length) return;
	removeClassFrom(_hoveredElements, HOVER_OUTLINE_CLASS);
	_hoveredElements = targets;
	addClassTo(_hoveredElements, HOVER_OUTLINE_CLASS);
}

/** Hides the hover outline (no-op while held). */
export function hideHoverOutline() {
	if (_holdCount > 0) return;
	removeClassFrom(_hoveredElements, HOVER_OUTLINE_CLASS);
	_hoveredElements = [];
}

export function holdHoverOutline() { _holdCount++; }
export function releaseHoverOutline() {
	_holdCount = Math.max(0, _holdCount - 1);
	if (_holdCount === 0) hideHoverOutline();
}

/**
 * Solid outline for a committed selection — a drag preview, a shift+click
 * group, or the element(s) an open annotation panel targets.
 * @param {HTMLElement|HTMLElement[]} elements
 */
export function lockHoverOutline(elements) {
	const targets = toArray(elements);
	if (!targets.length) {
		unlockHoverOutline();
		return;
	}
	removeClassFrom(_lockedElements, LOCKED_OUTLINE_CLASS);
	_lockedElements = targets;
	addClassTo(_lockedElements, LOCKED_OUTLINE_CLASS);
}

export function unlockHoverOutline() {
	removeClassFrom(_lockedElements, LOCKED_OUTLINE_CLASS);
	_lockedElements = [];
}
