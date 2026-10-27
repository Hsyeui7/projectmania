/**
 * Group selection built by a rubber-band drag or shift+click. The committed
 * group is document-ordered and never nested; `_drag*` lives for one gesture.
 */

/** @type {HTMLElement[]} */
let _selectedElements = [];
let _dragStartX = null;
let _dragStartY = null;
let _isDragging = false;
/** Set on mouseup so the synthetic click a drag leaves behind is swallowed. */
let _hadDrag = false;

export function getSelectedElements() { return _selectedElements; }
export function setSelectedElements(value) { _selectedElements = value; }

export function getDragStartX() { return _dragStartX; }
export function getDragStartY() { return _dragStartY; }
export function setDragStart(x, y) { _dragStartX = x; _dragStartY = y; }
export function clearDragStart() { _dragStartX = null; _dragStartY = null; }

export function getIsDragging() { return _isDragging; }
export function setIsDragging(value) { _isDragging = value; }

export function getHadDrag() { return _hadDrag; }
export function setHadDrag(value) { _hadDrag = value; }

/** True when a mousedown is pending and could still become a drag. */
export function isDragPending() { return _dragStartX !== null; }

/** Drops the current group without touching an in-flight gesture. */
export function clearSelectedElements() { _selectedElements = []; }

/**
 * Drops members that have left the page, so a group never outlives the route it
 * was made on or holds nodes a re-render replaced.
 * @returns {boolean} True when the group changed.
 */
export function pruneDetachedSelection() {
	const connected = _selectedElements.filter(element => element.isConnected);
	if (connected.length === _selectedElements.length) return false;

	_selectedElements = connected;
	return true;
}

/** Resets everything, including any gesture in progress. */
export function resetMultiSelectState() {
	_selectedElements = [];
	_dragStartX = null;
	_dragStartY = null;
	_isDragging = false;
	_hadDrag = false;
}

/**
 * Dedupes and puts the group in document order, which fixes the marker's anchor
 * element and the order selections reach the AI.
 * @param {HTMLElement[]} elements
 * @returns {HTMLElement[]}
 */
export function orderSelection(elements) {
	return [...new Set(elements)]
		.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/**
 * Adds the element to the group, or removes it when already a member. Nesting is
 * allowed: picking a parent on top of its children is an explicit choice.
 * @param {HTMLElement} element
 * @returns {HTMLElement[]} The new group.
 */
export function toggleSelectedElement(element) {
	_selectedElements = _selectedElements.includes(element)
		? _selectedElements.filter(member => member !== element)
		: orderSelection([..._selectedElements, element]);
	return _selectedElements;
}
