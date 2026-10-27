/**
 * DOM range helpers for applying bold, italic, underline, and alignment inside
 * the active contenteditable selection.
 */
import {
	getTextNodesInRange,
	isNodeBold,
	isNodeItalic,
	isNodeUnderlined,
} from '../../utils/inline-style-state.js';

function hasAncestorTag(textNode, tagNames, stopAt) {
    let element = textNode.parentElement;
    while (element && element !== stopAt) {
        if (tagNames.includes(element.tagName.toLowerCase())) return true;
        element = element.parentElement;
    }
    return false;
}

function isFullyWrapped(range, tagNames, editTarget) {
    if (range.collapsed) return false;
    const nodes = getTextNodesInRange(range);
    return nodes.length > 0 && nodes.every(node => hasAncestorTag(node, tagNames, editTarget));
}

/**
 * Wraps a range in an element, with optional inline styles.
 * @param {Range} range
 * @param {string} tagName
 * @param {object} [styleProperties]
 * @returns {HTMLElement}
 */
export function wrapRange(range, tagName, styleProperties) {
    const wrapper = document.createElement(tagName);
    if (styleProperties) Object.assign(wrapper.style, styleProperties);
    try {
        range.surroundContents(wrapper);
    } catch {
        wrapper.appendChild(range.extractContents());
        range.insertNode(wrapper);
    }
    if (!styleProperties) {
        wrapper.querySelectorAll(tagName).forEach(element => element.replaceWith(...element.childNodes));
        wrapper.normalize();
    }
    return wrapper;
}

function restoreSelectionOver(firstNode, lastNode) {
    if (!firstNode || !lastNode) return;
    try {
        const newRange = document.createRange();
        if (firstNode.nodeType === Node.TEXT_NODE) {
            newRange.setStart(firstNode, 0);
        } else {
            newRange.setStartBefore(firstNode);
        }
        if (lastNode.nodeType === Node.TEXT_NODE) {
            newRange.setEnd(lastNode, lastNode.length);
        } else {
            newRange.setEndAfter(lastNode);
        }
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(newRange);
    } catch { /* ignore invalid range errors */ }
}

function ancestorDepthWithin(element, editTarget) {
    let depth = 0;
    let current = element;
    while (current && current !== editTarget) {
        depth += 1;
        current = current.parentElement;
    }
    return depth;
}

/**
 * Removes a single inline wrapper element over the portion covered by `range`,
 * keeping the parts outside the range wrapped and preserving every descendant
 * (e.g. a nested `<strong>`) of the in-range portion. Splitting the element when
 * the selection only partially covers it.
 * @param {HTMLElement} element
 * @param {Range} range
 */
function unwrapElementOverRange(element, range) {
    const elementContents = document.createRange();
    elementContents.selectNodeContents(element);

    const selectionStartsInside = range.compareBoundaryPoints(Range.START_TO_START, elementContents) > 0;
    const selectionEndsInside = range.compareBoundaryPoints(Range.END_TO_END, elementContents) < 0;

    if (selectionEndsInside) {
        const afterRange = document.createRange();
        afterRange.setStart(range.endContainer, range.endOffset);
        afterRange.setEnd(elementContents.endContainer, elementContents.endOffset);
        const afterContent = afterRange.extractContents();
        if (afterContent.textContent !== '') {
            const afterClone = element.cloneNode(false);
            afterClone.appendChild(afterContent);
            element.after(afterClone);
        }
    }

    if (selectionStartsInside) {
        const beforeRange = document.createRange();
        beforeRange.setStart(elementContents.startContainer, elementContents.startOffset);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        const beforeContent = beforeRange.extractContents();
        if (beforeContent.textContent !== '') {
            const beforeClone = element.cloneNode(false);
            beforeClone.appendChild(beforeContent);
            element.before(beforeClone);
        }
    }

    element.replaceWith(...element.childNodes);
}

function unwrapTagsInRange(range, tagNames, editTarget) {
    const tagSet = tagNames.map(tag => tag.toLowerCase());
    const textNodes = getTextNodesInRange(range);
    const firstTextNode = textNodes[0] ?? null;
    const lastTextNode = textNodes[textNodes.length - 1] ?? null;

    const targetElements = [];
    for (const textNode of textNodes) {
        let element = textNode.parentElement;
        while (element && element !== editTarget) {
            if (tagSet.includes(element.tagName?.toLowerCase()) && !targetElements.includes(element)) {
                targetElements.push(element);
            }
            element = element.parentElement;
        }
    }

    // Unwrap the deepest wrappers first so re-parenting never shifts the
    // boundaries of a shallower wrapper still waiting to be processed.
    targetElements.sort((a, b) => ancestorDepthWithin(b, editTarget) - ancestorDepthWithin(a, editTarget));
    for (const element of targetElements) {
        unwrapElementOverRange(element, range);
    }

    restoreSelectionOver(firstTextNode, lastTextNode);
    editTarget.normalize();
}

/**
 * Returns the user's active text selection inside the edit target.
 * When the caret is collapsed (no highlighted text), the entire element's
 * contents are selected so that style actions apply to all text.
 * @param {HTMLElement} editTarget
 * @returns {Range|null} Selection range inside the edit target.
 */
export function getActiveRange(editTarget) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    if (selection.isCollapsed) {
        if (!editTarget.contains(selection.anchorNode)) return null;
        const range = document.createRange();
        range.selectNodeContents(editTarget);
        selection.removeAllRanges();
        selection.addRange(range);
        return range;
    }

    const range = selection.getRangeAt(0);
    if (!editTarget.contains(range.commonAncestorContainer)) return null;
    return range;
}

/** Tailwind utility classes cleared when toggling bold off on an edit target. */
const TAILWIND_BOLD_CLASSES = ['font-bold', 'font-semibold', 'font-extrabold', 'font-black'];

/** Tailwind utility classes cleared when toggling italic off on an edit target. */
const TAILWIND_ITALIC_CLASSES = ['italic'];

function isFullyBold(range, editTarget) {
    if (range.collapsed) return false;
    const nodes = getTextNodesInRange(range);
    return nodes.length > 0 && nodes.every((node) => isNodeBold(node, editTarget));
}

function isFullyItalic(range, editTarget) {
    if (range.collapsed) return false;
    const nodes = getTextNodesInRange(range);
    return nodes.length > 0 && nodes.every((node) => isNodeItalic(node, editTarget));
}

/**
 * Toggles bold on the current selection within the edit target.
 * @param {HTMLElement} editTarget
 */
export function applyBold(editTarget) {
    const range = getActiveRange(editTarget);
    if (!range) return;
    if (isFullyBold(range, editTarget)) {
        unwrapTagsInRange(range, ['strong', 'b'], editTarget);
        TAILWIND_BOLD_CLASSES.forEach(className => editTarget.classList.remove(className));
        if (editTarget.style.fontWeight) editTarget.style.removeProperty('font-weight');
        const selection = window.getSelection();
        if (selection?.rangeCount > 0 && !selection.isCollapsed) {
            const selectionRange = selection.getRangeAt(0);
            if (isFullyBold(selectionRange, editTarget)) wrapRange(selectionRange, 'span', { fontWeight: 'normal' });
        }
    } else {
        wrapRange(range, 'strong');
    }
    editTarget.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Toggles italic on the current selection within the edit target.
 * @param {HTMLElement} editTarget
 */
export function applyItalic(editTarget) {
    const range = getActiveRange(editTarget);
    if (!range) return;
    if (isFullyItalic(range, editTarget)) {
        unwrapTagsInRange(range, ['em', 'i'], editTarget);
        TAILWIND_ITALIC_CLASSES.forEach(className => editTarget.classList.remove(className));
        if (editTarget.style.fontStyle) editTarget.style.removeProperty('font-style');
        const selection = window.getSelection();
        if (selection?.rangeCount > 0 && !selection.isCollapsed) {
            const selectionRange = selection.getRangeAt(0);
            if (isFullyItalic(selectionRange, editTarget)) wrapRange(selectionRange, 'span', { fontStyle: 'normal' });
        }
    } else {
        wrapRange(range, 'em');
    }
    editTarget.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Tailwind utility classes cleared when toggling underline off on an edit target. */
const TAILWIND_UNDERLINE_CLASSES = ['underline'];

function isRangeFullyUnderlined(range, editTarget) {
    if (range.collapsed) return false;
    const nodes = getTextNodesInRange(range);
    return nodes.length > 0 && nodes.every((node) => isNodeUnderlined(node, editTarget));
}

function removeExplicitUnderlineInRange(range, editTarget) {
    getTextNodesInRange(range).forEach(node => {
        let element = node.parentElement;
        while (element && element !== editTarget) {
            if (element.style?.textDecoration?.includes('underline') || element.style?.textDecorationLine?.includes('underline')) {
                element.style.removeProperty('text-decoration');
                element.style.removeProperty('text-decoration-line');
            }
            element = element.parentElement;
        }
    });
}

function getContextualDecorationStyle(range) {
    // When text sits between CSS-class underline siblings (after a split), inherit
    // their full decoration style so re-applied underline visually matches.
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;

    for (const sibling of [node.previousSibling, node.nextSibling]) {
        if (!sibling || sibling.nodeType !== Node.ELEMENT_NODE) continue;
        const computedStyle = getComputedStyle(sibling);
        const textDecorationLine = computedStyle.textDecorationLine || computedStyle.textDecoration || '';
        if (!textDecorationLine.includes('underline')) continue;

        const style = {};
        if (computedStyle.textDecorationColor) {
            style.textDecorationColor = computedStyle.textDecorationColor;
        }
        if (computedStyle.textDecorationThickness && computedStyle.textDecorationThickness !== 'auto') {
            style.textDecorationThickness = computedStyle.textDecorationThickness;
        }
        if (computedStyle.textDecorationStyle && computedStyle.textDecorationStyle !== 'solid') {
            style.textDecorationStyle = computedStyle.textDecorationStyle;
        }
        return Object.keys(style).length > 0 ? style : null;
    }
    return null;
}

function getEffectiveTextColor(range, editTarget) {
    const nodes = getTextNodesInRange(range);
    if (nodes.length === 0 && range.startContainer.nodeType === Node.TEXT_NODE) {
        nodes.push(range.startContainer);
    }
    if (nodes.length === 0) return null;

    const containerColor = getComputedStyle(editTarget).color;
    for (const textNode of nodes) {
        let element = textNode.parentElement;
        while (element && element !== editTarget) {
            const inlineColor = element.style?.color;
            if (inlineColor && inlineColor !== 'transparent') return inlineColor;
            element = element.parentElement;
        }
        const parent = textNode.parentElement;
        if (!parent) continue;
        const computed = getComputedStyle(parent).color;
        if (computed && computed !== containerColor && computed !== 'rgba(0, 0, 0, 0)') {
            return computed;
        }
    }
    return null;
}

function buildUnderlineWrapStyle(range, editTarget) {
    const style = getContextualDecorationStyle(range) ?? {};
    const textColor = getEffectiveTextColor(range, editTarget);
    if (textColor) {
        style.textDecorationColor = textColor;
    }
    return Object.keys(style).length > 0 ? style : null;
}

/** Keeps `<u>` decoration color in sync when nested text color changes. */
export function syncUnderlineColorFromElement(element, editTarget) {
    if (!element || !editTarget) return;
    const inlineColor = element.style?.color;
    const containerColor = getComputedStyle(editTarget).color;
    const decorationColor = inlineColor
        || (() => {
            const computed = getComputedStyle(element).color;
            return computed !== containerColor && computed !== 'rgba(0, 0, 0, 0)' ? computed : null;
        })();
    if (!decorationColor) return;

    let node = element.parentElement;
    while (node && node !== editTarget) {
        if (node.tagName?.toLowerCase() === 'u') {
            node.style.textDecorationColor = decorationColor;
        }
        node = node.parentElement;
    }
}

function findCssUnderlineAncestor(node, editTarget) {
    // Find the closest ancestor that sources underline via a CSS class, not a <u> tag
    // or inline style — those are handled by other steps.
    let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (element && element !== editTarget) {
        if (element.tagName?.toLowerCase() === 'u') { element = element.parentElement; continue; }
        const hasInline = element.style?.textDecoration?.includes('underline') || element.style?.textDecorationLine?.includes('underline');
        if (hasInline) { element = element.parentElement; continue; }
        const textDecorationLine = getComputedStyle(element).textDecorationLine || getComputedStyle(element).textDecoration || '';
        if (textDecorationLine.includes('underline')) return element;
        element = element.parentElement;
    }
    return null;
}

function splitElementAroundRange(range, ancestor, editTarget) {
    const fragment = range.extractContents();
    const selectionFirst = fragment.firstChild;
    const selectionLast  = fragment.lastChild;

    const parent  = ancestor.parentNode;
    const nextSibling = ancestor.nextSibling;

    const afterRange = document.createRange();
    afterRange.setStart(range.startContainer, range.startOffset);
    if (ancestor.lastChild) afterRange.setEndAfter(ancestor.lastChild);
    else afterRange.collapse(true);
    const afterContent = ancestor.lastChild ? afterRange.extractContents() : null;

    parent.insertBefore(fragment, nextSibling);

    if (afterContent?.textContent) {
        const afterClone = ancestor.cloneNode(false);
        afterClone.appendChild(afterContent);
        parent.insertBefore(afterClone, nextSibling);
    }

    if (!ancestor.textContent) ancestor.remove();

    restoreSelectionOver(selectionFirst, selectionLast);
    editTarget.normalize();
}

/**
 * Toggles underline on the current selection within the edit target.
 * @param {HTMLElement} editTarget
 */
export function applyUnderline(editTarget) {
    const range = getActiveRange(editTarget);
    if (!range) return;

    if (isRangeFullyUnderlined(range, editTarget)) {
        if (getTextNodesInRange(range).some(node => hasAncestorTag(node, ['u'], editTarget))) {
            unwrapTagsInRange(range, ['u'], editTarget);
        }
        let selection = window.getSelection();
        if (selection?.rangeCount > 0) removeExplicitUnderlineInRange(selection.getRangeAt(0), editTarget);
        // Strip Tailwind underline classes from the editTarget itself
        TAILWIND_UNDERLINE_CLASSES.forEach(className => editTarget.classList.remove(className));
        selection = window.getSelection();
        if (selection?.rangeCount > 0 && !selection.isCollapsed) {
            const selectionRange = selection.getRangeAt(0);
            if (isRangeFullyUnderlined(selectionRange, editTarget)) {
                const textNodes = getTextNodesInRange(selectionRange);
                const cssAncestor = textNodes.length > 0 ? findCssUnderlineAncestor(textNodes[0], editTarget) : null;
                if (cssAncestor) splitElementAroundRange(selectionRange, cssAncestor, editTarget);
                else wrapRange(selectionRange, 'span', { textDecoration: 'none' });
            }
        }
    } else {
        const decorationStyle = buildUnderlineWrapStyle(range, editTarget);
        wrapRange(range, 'u', decorationStyle ?? undefined);
    }

    editTarget.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Finds the nearest ancestor `<span>` that already carries `styleProperty` and whose
 * text content exactly matches the selection. Reusing it (instead of nesting a
 * new inner span) keeps in-between elements like `<u>` at the same font-size as
 * the text, so e.g. underline thickness stays proportional.
 * @param {Range} range
 * @param {HTMLElement} editTarget
 * @param {string} styleProperty
 * @returns {HTMLElement|null}
 */
function findStyledAncestorWrappingRange(range, editTarget, styleProperty) {
    let element = range.commonAncestorContainer;
    if (element.nodeType === Node.TEXT_NODE) element = element.parentElement;
    const selectionText = range.toString();
    if (!selectionText) return null;
    let match = null;
    while (element && element !== editTarget) {
        if (element.nodeType === Node.ELEMENT_NODE && element.tagName === 'SPAN' && element.style[styleProperty]) {
            const elementRange = document.createRange();
            elementRange.selectNodeContents(element);
            if (elementRange.toString() === selectionText) match = element;
        }
        element = element.parentElement;
    }
    return match;
}

/**
 * Wraps the active selection in a span carrying one inline style prop,
 * stripping the same prop from descendants (and a redundant single-child
 * parent span) so values never nest.
 * @param {HTMLElement} editTarget
 * @param {string} styleProperty - camelCase property (e.g. 'fontSize').
 * @param {string} cssProperty - kebab-case property (e.g. 'font-size').
 * @param {string} value
 */
export function wrapSelectionWithStyle(editTarget, styleProperty, cssProperty, value) {
    const range = getActiveRange(editTarget);
    if (!range) return;
    const reuse = findStyledAncestorWrappingRange(range, editTarget, styleProperty);
    if (reuse) {
        reuse.style[styleProperty] = value;
        if (styleProperty === 'fontSize') reuse.style.lineHeight = 'normal';
        reuse.querySelectorAll('*').forEach(element => {
            if (element.style[styleProperty]) {
                element.style.removeProperty(cssProperty);
                if (!element.style.cssText.trim()) element.replaceWith(...element.childNodes);
            }
        });
        reuse.normalize();
        editTarget.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    const wrapperStyle = { [styleProperty]: value };
    if (styleProperty === 'fontSize') wrapperStyle.lineHeight = 'normal';
    const wrapper = wrapRange(range, 'span', wrapperStyle);
    if (wrapper) {
        wrapper.querySelectorAll('*').forEach(element => {
            if (element.style[styleProperty]) {
                element.style.removeProperty(cssProperty);
                if (!element.style.cssText.trim()) element.replaceWith(...element.childNodes);
            }
        });
        const parentElement = wrapper.parentElement;
        if (parentElement && parentElement !== editTarget && parentElement.tagName === 'SPAN' && parentElement.style[styleProperty] && parentElement.childNodes.length === 1) {
            parentElement.style.removeProperty(cssProperty);
            if (!parentElement.style.cssText.trim()) parentElement.replaceWith(...parentElement.childNodes);
        }
        wrapper.normalize();
    }
    editTarget.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Sets text-align on the edit target element.
 * @param {HTMLElement} editTarget
 * @param {'left'|'center'|'right'} alignment
 */
export function applyAlign(editTarget, alignment) {
    const current = getComputedStyle(editTarget).textAlign;
    if (current === alignment || (alignment === 'left' && (current === 'start' || current === 'left'))) return;
    editTarget.style.textAlign = alignment;
    editTarget.dispatchEvent(new Event('input', { bubbles: true }));
}
