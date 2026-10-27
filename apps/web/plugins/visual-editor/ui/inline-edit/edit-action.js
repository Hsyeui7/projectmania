import { getEditing, setEditing, clearEditing } from "../../state/editing-state.js";
import { normalizeContentEditableHtml, patchRemoveChild, serializeContentEditableHtml } from "../../utils/html-utils.js";
import { postToParent } from "../../utils/parent-frame.js";
import { ParentMessage } from "../../constants/messages.js";
import { beginEditSession, recordEdit } from "../../state/history-state.js";
import { notifyDraftStateChanged } from "../../api/draft-snapshot.js";
import { showTextFormatToolbar, hideTextFormatToolbar, scheduleRepositionEditOverlays } from "../text-format/toolbar/toolbar.js";
import { onSelectionChange } from "./cursor-styles.js";
import { captureElementMetadata } from "../../utils/selection-mode-metadata.js";


/**
 * Converts a CSS property name to its camelCase JS form
 * (e.g. `background-clip` → `backgroundClip`), matching the keys used by the
 * JSX style objects in the source write-back.
 */
function cssPropertyToCamelCase(cssProperty) {
    return cssProperty.replace(/^-/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

const TRANSPARENT_TEXT_CARET_COLOR = "#6B7280";

function isTransparentColor(color) {
    if (!color || color === "transparent") return true;
    const match = color.replace(/\s+/g, "").match(/^rgba?\(([^)]+)\)$/i);
    if (!match) return false;
    const segments = match[1].split(",");
    return segments.length === 4 && parseFloat(segments[3]) === 0;
}

/**
 * Reports whether the element or any descendant renders transparent text
 * (e.g. gradient text via `background-clip: text` + `color: transparent`),
 * where the caret would otherwise be invisible.
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function hasTransparentText(element) {
    if (isTransparentColor(getComputedStyle(element).color)) return true;
    return Array.from(element.querySelectorAll("*")).some(
        descendant => isTransparentColor(getComputedStyle(descendant).color)
    );
}

/** `caret-color: currentColor` is invisible on transparent/gradient text, so use a visible caret there. */
function applyEditingCaretColor(element) {
    if (hasTransparentText(element)) {
        element.style.caretColor = TRANSPARENT_TEXT_CARET_COLOR;
    } else {
        element.style.removeProperty("caret-color");
    }
}

/**
 * Snapshots every style property set inline on the element itself.
 * @param {HTMLElement} element
 * @returns {Record<string, string>} camelCase property → value
 */
function captureInlineStyles(element) {
    const styles = {};
    for (let index = 0; index < element.style.length; index++) {
        const cssProperty = element.style.item(index);
        styles[cssPropertyToCamelCase(cssProperty)] = element.style.getPropertyValue(cssProperty);
    }
    return styles;
}

/**
 * Diffs the element's current inline styles against a snapshot, covering any
 * panel action that styles the element itself ('' marks a removed property).
 * `textAlign` is excluded here — it is compared against computed style instead,
 * so re-applying an alignment inherited from CSS is not logged as a change.
 * @param {HTMLElement} element
 * @param {Record<string, string>} original
 * @returns {{ changed: Record<string, string>, previous: Record<string, string> }|null}
 */
function getInlineStyleDiff(element, original) {
    const current = captureInlineStyles(element);
    const changed = {};
    const previous = {};
    for (const key of new Set([...Object.keys(current), ...Object.keys(original)])) {
        if (key === 'textAlign') continue;
        // Transient editing caret-color must never be written back to source.
        if (key === 'caretColor') continue;
        if ((current[key] ?? '') !== (original[key] ?? '')) {
            changed[key] = current[key] ?? '';
            previous[key] = original[key] ?? '';
        }
    }
    return Object.keys(changed).length > 0 ? { changed, previous } : null;
}

/**
 * Computes element-level style changes (alignment plus any other inline style
 * the panel set on the element) since the edit session's last snapshot.
 * @param {object} editing - Current editing state.
 * @returns {{ style: object|null }}
 */
function buildStyleDiff(editing) {
    const { targetElement, originalTextAlign, originalInlineTextAlign, originalInlineStyles } = editing;
    const alignChanged = getComputedStyle(targetElement).textAlign !== originalTextAlign;
    const inlineDiff = getInlineStyleDiff(targetElement, originalInlineStyles);
    if (!alignChanged && !inlineDiff) return { style: null, oldStyle: null };

    const style = {};
    const oldStyle = {};
    if (alignChanged) {
        style.textAlign = targetElement.style.textAlign;
        // Keep previous inline value around so re-applying the inherited default still serializes.
        if (!style.textAlign) style.textAlign = originalInlineTextAlign ?? '';
        oldStyle.textAlign = originalInlineTextAlign ?? '';
    }
    if (inlineDiff) {
        Object.assign(style, inlineDiff.changed);
        Object.assign(oldStyle, inlineDiff.previous);
    }
    return { style, oldStyle };
}

/** Re-snapshots the editing state's style baselines after a soft-save. */
function refreshStyleSnapshots(editing) {
    const { targetElement } = editing;
    editing.originalTextAlign = getComputedStyle(targetElement).textAlign;
    editing.originalInlineTextAlign = targetElement.style.textAlign || '';
    editing.originalInlineStyles = captureInlineStyles(targetElement);
}

/**
 * Snapshots child nodes so DOM mutations during edit can be restored if needed.
 * @param {HTMLElement} element
 * @returns {Array<{ node: Node, value: string|null }>}
 */
export function saveChildNodes(element) {
    const saved = [];
    for (const child of element.childNodes) {
        saved.push({
            node: child,
            value: child.nodeType === Node.TEXT_NODE ? child.nodeValue : null,
        });
    }
    return saved;
}

/**
 * Places a collapsed caret at the end of the editable container's contents.
 * @param {HTMLElement} container
 */
export function placeCursorAtEnd(container) {
    if (!container.childNodes.length) {
        container.appendChild(document.createTextNode(''));
    }

    let target = container;
    while (target.lastChild) {
        target = target.lastChild;
    }

    const range = document.createRange();
    if (target.nodeType === Node.TEXT_NODE) {
        range.setStart(target, target.textContent.length);
    } else {
        range.selectNodeContents(target);
    }
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Places the text caret at viewport coordinates, clamped to the editable container.
 * @param {number} x
 * @param {number} y
 * @param {HTMLElement} [container]
 */
export function placeCursorAtPoint(x, y, container) {
    let range = null;
    if (document.caretPositionFromPoint) {
        const position = document.caretPositionFromPoint(x, y);
        if (position) {
            range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
        }
    } else if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y);
    }

    // If the caret resolved outside our editable target (e.g. an absolute overlay
    // sat on top of the click point), fall back to placing it at the end of the
    // target so typing actually goes into the contenteditable.
    if (container && (!range || !container.contains(range.startContainer))) {
        range = document.createRange();
        range.selectNodeContents(container);
        range.collapse(false);
    }

    if (!range) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Enables contenteditable on the target and wires edit listeners and toolbar.
 * @param {HTMLElement} targetElement
 * @param {string} editId
 * @param {string} currentContent - Initial HTML content.
 * @param {{ focusTarget?: boolean }} [options] - Pass `focusTarget: false` when the caller focuses its own UI instead.
 */
export function startInlineEdit(targetElement, editId, currentContent, { focusTarget = true } = {}) {
    if (getEditing()?.targetElement === targetElement) return;

    const savedChildren = saveChildNodes(targetElement);
    const normalizedOriginal = normalizeContentEditableHtml(currentContent);
    const sessionId = beginEditSession();
    const selectionMode = captureElementMetadata(targetElement);
    setEditing({
        editId,
        targetElement,
        sessionId,
        originalContent: normalizedOriginal,
        originalTextAlign: getComputedStyle(targetElement).textAlign,
        originalInlineTextAlign: targetElement.style.textAlign || '',
        originalInlineStyles: captureInlineStyles(targetElement),
        savedChildren,
        selectionMode,
    });
    document.getElementById("root")?.setAttribute("data-inline-editing", "true");
    targetElement.setAttribute("data-editing", "true");
    patchRemoveChild(targetElement);

    targetElement.setAttribute("contenteditable", "true");
    applyEditingCaretColor(targetElement);

    if (focusTarget) {
        targetElement.focus();
        placeCursorAtEnd(targetElement);

        requestAnimationFrame(() => {
            if (getEditing()?.targetElement !== targetElement) return;
            placeCursorAtEnd(targetElement);
            targetElement.focus();
        });
    }

    postToParent(ParentMessage.EDIT_ENTER, {
        currentText: currentContent,
        elementType: targetElement.tagName.toLowerCase(),
        isDirectlyEditable: targetElement.hasAttribute('data-edit-id'),
    });
    showTextFormatToolbar(targetElement);
    targetElement.addEventListener("keydown", onInlineEditKeyDown);
    targetElement.addEventListener("beforeinput", onInlineEditBeforeInput);
    targetElement.addEventListener("input", onInlineEditInput);
    targetElement.addEventListener("tft-color-commit", saveCurrentEdit);
    document.addEventListener("selectionchange", onSelectionChange);
    setTimeout(onSelectionChange, 0);
}

/**
 * Soft-saves the current edit without tearing down contenteditable (e.g. color commit),
 * recording it into the in-iframe edit history so it can be undone/redone and
 * later batch-persisted on draft save.
 */
export function saveCurrentEdit() {
    const editing = getEditing();
    if (!editing) return;

    const { editId, targetElement, originalContent, sessionId, selectionMode } = editing;
    const newHTML = serializeContentEditableHtml(targetElement);
    const { style, oldStyle } = buildStyleDiff(editing);
    const isAssisted = targetElement.hasAttribute('data-edit-assisted-id');

    if (newHTML !== originalContent || style) {
        recordEdit(editId, { beforeContent: originalContent, afterContent: newHTML }, { style, oldStyle, element: targetElement, sessionId, isAssisted, selectionMode });
        notifyDraftStateChanged();
        editing.originalContent = newHTML;
        editing.hasSoftSaved = true;
        refreshStyleSnapshots(editing);
    }
}

/** Finalizes the active inline edit, records it into history, and clears editing state. */
export function commitCurrentEdit() {
    const editing = getEditing();
    if (!editing) return;

    const { editId, targetElement, originalContent, sessionId, selectionMode } = editing;
    const newHTML = serializeContentEditableHtml(targetElement);
    const { style, oldStyle } = buildStyleDiff(editing);
    const isAssisted = targetElement.hasAttribute('data-edit-assisted-id');

    targetElement.removeAttribute("contenteditable");
    targetElement.removeAttribute("data-editing");
    targetElement.style.removeProperty("caret-color");
    document.getElementById("root")?.removeAttribute("data-inline-editing");
    targetElement.removeEventListener("keydown", onInlineEditKeyDown);
    targetElement.removeEventListener("beforeinput", onInlineEditBeforeInput);
    targetElement.removeEventListener("input", onInlineEditInput);
    targetElement.removeEventListener("tft-color-commit", saveCurrentEdit);
    document.removeEventListener("selectionchange", onSelectionChange);
    hideTextFormatToolbar();

    patchRemoveChild(targetElement);
    targetElement.innerHTML = newHTML;

    const { hasSoftSaved } = editing;

    if (newHTML !== originalContent || style) {
        recordEdit(editId, { beforeContent: originalContent, afterContent: newHTML }, { style, oldStyle, element: targetElement, sessionId, isAssisted, selectionMode });
        notifyDraftStateChanged();
    } else if (!hasSoftSaved) {
        postToParent(ParentMessage.EDIT_CANCEL, {});
    }

    clearEditing();
}

/**
 * Blocks browser replacement-text input during inline edit.
 * @param {InputEvent} e
 */
export function onInlineEditBeforeInput(event) {
    if (event.inputType === "insertReplacementText") {
        event.preventDefault();
        return;
    }
    scheduleRepositionEditOverlays();
}

/** Repositions the toolbar as the editable content grows/shrinks. */
export function onInlineEditInput() {
    if (!getEditing()) return;
    saveCurrentEdit();
    scheduleRepositionEditOverlays();
}

/**
 * Handles Escape/Enter to commit and stops propagation for other keys.
 * @param {KeyboardEvent} e
 */
export function onInlineEditKeyDown(event) {
    if (event.key === "Escape") {
        event.preventDefault();
        commitCurrentEdit();
        return;
    }
    if (event.key === "Enter") {
        if (event.shiftKey) {
            event.stopPropagation();
            return;
        }
        event.preventDefault();
        commitCurrentEdit();
        return;
    }
    if (event.key === " " && event.currentTarget.tagName.toLowerCase() === "button") {
        // Native <button> treats Space as activation, not text input, so the
        // browser never inserts a character. Prevent the activation and insert
        // the space manually (execCommand keeps the input event).
        event.preventDefault();
        document.execCommand("insertText", false, " ");
        return;
    }
    event.stopPropagation();
}

