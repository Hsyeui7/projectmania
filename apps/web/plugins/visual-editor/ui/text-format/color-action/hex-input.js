import { parseHexInput } from './color-conversions.js';

let _element = null;
let hexVirtualValue = '';
let hexVirtualCursor = 0;
let hexAnchor = 0;
let hexInputActive = false;

/** @param {HTMLElement} element */
export function initHexInput(element) { _element = element; }

/** @returns {boolean} */
export function isHexInputActive() { return hexInputActive; }
/** @returns {string} */
export function getHexValue()      { return hexVirtualValue; }

/** @returns {number} Lower selection bound. */
function selectionStart() { return Math.min(hexAnchor, hexVirtualCursor); }
/** @returns {number} Upper selection bound. */
function selectionEnd() { return Math.max(hexAnchor, hexVirtualCursor); }
/** @returns {boolean} Whether a (non-collapsed) selection exists. */
function hasSelection() { return hexAnchor !== hexVirtualCursor; }
/** Collapses the selection onto the caret. */
function collapseSelection() { hexAnchor = hexVirtualCursor; }

/**
 * @param {string} hex
 */
export function setHexFromPicker(hex) {
    hexVirtualValue = hex;
    hexVirtualCursor = hex.length;
    hexAnchor = hex.length;
    renderHexInput();
}

/** @param {boolean} active */
export function setHexInputActive(active) {
    hexInputActive = active;
    if (!active) {
        _element?.classList.remove('tca-focused');
        collapseSelection();
    }
}

/** Selects the whole hex value (e.g. on double-click) so the next input/paste replaces it. */
export function selectAllHex() {
    hexInputActive = true;
    _element?.classList.add('tca-focused');
    hexAnchor = 0;
    hexVirtualCursor = hexVirtualValue.length;
    renderHexInput();
}

/** Renders the virtual hex field as per-character spans (so selection can be highlighted). */
export function renderHexInput() {
    if (!_element) return;
    if (!hexInputActive) {
        _element.textContent = hexVirtualValue;
        return;
    }
    const start = selectionStart();
    const end = selectionEnd();
    const caret = '<span class="tft-picker-hex-cursor"></span>';
    let html = '';
    for (let index = 0; index < hexVirtualValue.length; index++) {
        if (index === hexVirtualCursor) html += caret;
        const selectionClass = index >= start && index < end ? ' tft-picker-hex-csel' : '';
        html += `<span class="tft-picker-hex-char${selectionClass}" data-i="${index}">${hexVirtualValue[index]}</span>`;
    }
    if (hexVirtualCursor === hexVirtualValue.length) html += caret;
    _element.innerHTML = html;
}

/**
 * Maps a viewport x coordinate to a caret index between characters.
 * @param {number} pointerX
 * @returns {number}
 */
function caretIndexFromPointerX(pointerX) {
    if (!_element) return 0;
    const characters = _element.querySelectorAll('.tft-picker-hex-char');
    for (let index = 0; index < characters.length; index++) {
        const characterBounds = characters[index].getBoundingClientRect();
        if (pointerX < characterBounds.left + characterBounds.width / 2) return index;
    }
    return characters.length;
}

/**
 * Begins a click/drag in the field: activates it and drops a collapsed caret.
 * @param {number} pointerX
 */
export function hexPointerDown(pointerX) {
    hexInputActive = true;
    _element?.classList.add('tca-focused');
    renderHexInput();
    const caretIndex = caretIndexFromPointerX(pointerX);
    hexAnchor = caretIndex;
    hexVirtualCursor = caretIndex;
    renderHexInput();
}

/**
 * Extends the selection to the dragged-to position.
 * @param {number} pointerX
 */
export function hexPointerMove(pointerX) {
    if (!hexInputActive) return;
    hexVirtualCursor = caretIndexFromPointerX(pointerX);
    renderHexInput();
}

/**
 * @param {KeyboardEvent} event
 * @param {{ onLiveChange: (hex: string) => void, onCommit: (hex: string) => void, onCancel: () => void }} callbacks
 */
export function handleHexKeydown(event, { onLiveChange, onCommit, onCancel }) {
    if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
        const hex = parseHexInput(hexVirtualValue);
        if (hex) onCommit(hex);
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        onCancel();
        return;
    }

    if (!hexInputActive) return;

    if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault(); event.stopPropagation();
        hexAnchor = 0;
        hexVirtualCursor = hexVirtualValue.length;
        renderHexInput();
        return;
    }

    if (hasSelection()) {
        const start = selectionStart();
        const end = selectionEnd();
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && /[#0-9a-fA-F]/.test(event.key)) {
            event.preventDefault(); event.stopPropagation();
            hexVirtualValue = (hexVirtualValue.slice(0, start) + event.key + hexVirtualValue.slice(end)).slice(0, 7);
            hexVirtualCursor = start + 1;
            collapseSelection();
            renderHexInput();
            onLiveChange(hexVirtualValue);
            return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault(); event.stopPropagation();
            hexVirtualValue = hexVirtualValue.slice(0, start) + hexVirtualValue.slice(end);
            hexVirtualCursor = start;
            collapseSelection();
            renderHexInput();
            onLiveChange(hexVirtualValue);
            return;
        }
        collapseSelection();
    }

    if (event.key === 'Backspace') {
        event.preventDefault(); event.stopPropagation();
        if (hexVirtualCursor > 0) {
            hexVirtualValue = hexVirtualValue.slice(0, hexVirtualCursor - 1) + hexVirtualValue.slice(hexVirtualCursor);
            hexVirtualCursor--;
            collapseSelection();
            renderHexInput();
            onLiveChange(hexVirtualValue);
        }
        return;
    }
    if (event.key === 'Delete') {
        event.preventDefault(); event.stopPropagation();
        if (hexVirtualCursor < hexVirtualValue.length) {
            hexVirtualValue = hexVirtualValue.slice(0, hexVirtualCursor) + hexVirtualValue.slice(hexVirtualCursor + 1);
            collapseSelection();
            renderHexInput();
            onLiveChange(hexVirtualValue);
        }
        return;
    }
    if ((event.key === 'ArrowLeft' && (event.metaKey || event.ctrlKey)) || event.key === 'Home') {
        event.preventDefault(); event.stopPropagation();
        hexVirtualCursor = 0; collapseSelection(); renderHexInput(); return;
    }
    if ((event.key === 'ArrowRight' && (event.metaKey || event.ctrlKey)) || event.key === 'End') {
        event.preventDefault(); event.stopPropagation();
        hexVirtualCursor = hexVirtualValue.length; collapseSelection(); renderHexInput(); return;
    }
    if (event.key === 'ArrowLeft') {
        event.preventDefault(); event.stopPropagation();
        hexVirtualCursor = Math.max(0, hexVirtualCursor - 1); collapseSelection(); renderHexInput(); return;
    }
    if (event.key === 'ArrowRight') {
        event.preventDefault(); event.stopPropagation();
        hexVirtualCursor = Math.min(hexVirtualValue.length, hexVirtualCursor + 1); collapseSelection(); renderHexInput(); return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault(); event.stopPropagation();
        if (hexVirtualValue.length < 7 && /[#0-9a-fA-F]/.test(event.key)) {
            hexVirtualValue = hexVirtualValue.slice(0, hexVirtualCursor) + event.key + hexVirtualValue.slice(hexVirtualCursor);
            hexVirtualCursor++;
            collapseSelection();
            renderHexInput();
            onLiveChange(hexVirtualValue);
        }
    }
}

/**
 * Handles copy/cut for the virtual hex field: writes the selected text to the
 * clipboard ourselves (the field isn't a real input, so the browser can't).
 * @param {ClipboardEvent} event
 * @returns {boolean} Whether the value changed (cut).
 */
export function handleHexCopy(event) {
    if (!hexInputActive || !hasSelection()) return false;
    const text = hexVirtualValue.slice(selectionStart(), selectionEnd());
    if (!text) return false;
    event.preventDefault(); event.stopPropagation();
    event.clipboardData?.setData('text/plain', text);
    if (event.type === 'cut') {
        const start = selectionStart();
        hexVirtualValue = hexVirtualValue.slice(0, start) + hexVirtualValue.slice(selectionEnd());
        hexVirtualCursor = start;
        collapseSelection();
        renderHexInput();
        return true;
    }
    return false;
}

/**
 * @param {ClipboardEvent} event
 * @returns {string|undefined} Updated hex value after paste.
 */
export function handleHexPaste(event) {
    event.preventDefault(); event.stopPropagation();
    const inserted = (event.clipboardData?.getData('text/plain') || '').replace(/[^#0-9a-fA-F]/g, '');
    // Replace the current selection (if any), otherwise insert at the caret.
    const start = selectionStart();
    const end = selectionEnd();
    const next = (hexVirtualValue.slice(0, start) + inserted + hexVirtualValue.slice(end)).slice(0, 7);
    hexVirtualCursor = Math.min(next.length, start + inserted.length);
    hexVirtualValue = next;
    collapseSelection();
    renderHexInput();
    return hexVirtualValue;
}
