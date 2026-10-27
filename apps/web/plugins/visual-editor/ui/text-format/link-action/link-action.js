import { getEditing } from '../../../state/editing-state.js';
import { registerPanel, PanelId, setPanelVisible, isPanelVisible } from '../../../state/panel-state.js';
import { recordEdit } from '../../../state/history-state.js';
import { notifyDraftStateChanged } from '../../../api/draft-snapshot.js';
import { postToParent } from '../../../utils/parent-frame.js';
import { ParentMessage } from '../../../constants/messages.js';
import { escapeHtml } from '../../../utils/html-utils.js';
import { createPanelElement, positionDropdownPanel, createOutsideDismiss, captureSelectionRange } from '../dropdown-panel.js';
import { captureElementMetadata } from '../../../utils/selection-mode-metadata.js';
import { LINK_ACTION_HTML } from './template.js';
import { LINK_ACTION_STYLES } from './styles.js';

let linkActionElement = null;
let savedLinkRange = null;
let linkVirtualValue = '';
let linkVirtualCursor = 0;
let linkAnchor = 0;
let linkDragging = false;

const outsideDismiss = createOutsideDismiss({
    getElement: () => linkActionElement,
    dismiss: () => saveLink(),
});

/** @returns {number} Lower selection bound. */
function selectionStart() { return Math.min(linkAnchor, linkVirtualCursor); }
/** @returns {number} Upper selection bound. */
function selectionEnd() { return Math.max(linkAnchor, linkVirtualCursor); }
/** @returns {boolean} Whether a (non-collapsed) selection exists. */
function hasSelection() { return linkAnchor !== linkVirtualCursor; }
/** Collapses the selection onto the caret. */
function collapseSelection() { linkAnchor = linkVirtualCursor; }

function renderLinkInput() {
    const element = linkActionElement?.querySelector('#tft-link-url');
    if (!element) return;
    const caret = '<span class="tft-link-vcursor"></span>';
    if (!linkVirtualValue) {
        element.innerHTML = `<span class="tft-link-placeholder">Paste or type a link</span>${caret}`;
        return;
    }
    const start = selectionStart();
    const end = selectionEnd();
    let html = '';
    for (let index = 0; index < linkVirtualValue.length; index++) {
        if (index === linkVirtualCursor) html += caret;
        const selectionClass = index >= start && index < end ? ' tft-link-csel' : '';
        html += `<span class="tft-link-char${selectionClass}">${escapeHtml(linkVirtualValue[index])}</span>`;
    }
    if (linkVirtualCursor === linkVirtualValue.length) html += caret;
    element.innerHTML = html;
}

/** Selects the whole link value (double-click / Cmd+A) so the next input or paste replaces it. */
function selectAllLink() {
    linkAnchor = 0;
    linkVirtualCursor = linkVirtualValue.length;
    renderLinkInput();
}

/**
 * Maps a viewport x coordinate to a caret index between characters.
 * @param {number} pointerX
 * @returns {number}
 */
function caretIndexFromPointerX(pointerX) {
    const element = linkActionElement?.querySelector('#tft-link-url');
    if (!element) return 0;
    const characters = element.querySelectorAll('.tft-link-char');
    for (let index = 0; index < characters.length; index++) {
        const characterBounds = characters[index].getBoundingClientRect();
        // Caret goes before this character once the click lands left of its midpoint.
        if (pointerX < characterBounds.left + characterBounds.width / 2) return index;
    }
    return characters.length;
}

/**
 * Begins a click/drag in the field: drops a collapsed caret at the pointer.
 * @param {number} pointerX
 */
function linkPointerDown(pointerX) {
    renderLinkInput();
    const caretIndex = caretIndexFromPointerX(pointerX);
    linkAnchor = caretIndex;
    linkVirtualCursor = caretIndex;
    renderLinkInput();
}

/**
 * Extends the selection to the dragged-to position.
 * @param {number} pointerX
 */
function linkPointerMove(pointerX) {
    linkVirtualCursor = caretIndexFromPointerX(pointerX);
    renderLinkInput();
}

function onLinkKeydown(event) {
    if (!isPanelVisible(PanelId.LINK)) return;
    if (event.key === 'Enter')  { event.preventDefault(); event.stopPropagation(); saveLink(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hideLinkAction(); return; }
    if (event.key === 'a' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault(); event.stopPropagation();
        selectAllLink();
        return;
    }
    if (hasSelection()) {
        const start = selectionStart();
        const end = selectionEnd();
        if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault(); event.stopPropagation();
            linkVirtualValue = linkVirtualValue.slice(0, start) + linkVirtualValue.slice(end);
            linkVirtualCursor = start;
            collapseSelection();
            renderLinkInput();
            return;
        }
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
            event.preventDefault(); event.stopPropagation();
            linkVirtualValue = linkVirtualValue.slice(0, start) + event.key + linkVirtualValue.slice(end);
            linkVirtualCursor = start + 1;
            collapseSelection();
            renderLinkInput();
            return;
        }
        // Any other key collapses the selection before normal handling.
        collapseSelection();
    }
    if (event.key === 'Backspace') {
        event.preventDefault(); event.stopPropagation();
        if (linkVirtualCursor > 0) {
            linkVirtualValue = linkVirtualValue.slice(0, linkVirtualCursor - 1) + linkVirtualValue.slice(linkVirtualCursor);
            linkVirtualCursor--;
            collapseSelection();
            renderLinkInput();
        }
        return;
    }
    if (event.key === 'Delete') {
        event.preventDefault(); event.stopPropagation();
        if (linkVirtualCursor < linkVirtualValue.length) {
            linkVirtualValue = linkVirtualValue.slice(0, linkVirtualCursor) + linkVirtualValue.slice(linkVirtualCursor + 1);
            collapseSelection();
            renderLinkInput();
        }
        return;
    }
    if (event.key === 'Home' || (event.key === 'ArrowLeft' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault(); event.stopPropagation();
        linkVirtualCursor = 0;
        collapseSelection();
        renderLinkInput();
        return;
    }
    if (event.key === 'End' || (event.key === 'ArrowRight' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault(); event.stopPropagation();
        linkVirtualCursor = linkVirtualValue.length;
        collapseSelection();
        renderLinkInput();
        return;
    }
    if (event.key === 'ArrowLeft') {
        event.preventDefault(); event.stopPropagation();
        linkVirtualCursor = Math.max(0, linkVirtualCursor - 1);
        collapseSelection();
        renderLinkInput();
        return;
    }
    if (event.key === 'ArrowRight') {
        event.preventDefault(); event.stopPropagation();
        linkVirtualCursor = Math.min(linkVirtualValue.length, linkVirtualCursor + 1);
        collapseSelection();
        renderLinkInput();
        return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
        event.preventDefault(); event.stopPropagation();
        linkVirtualValue = linkVirtualValue.slice(0, linkVirtualCursor) + event.key + linkVirtualValue.slice(linkVirtualCursor);
        linkVirtualCursor++;
        collapseSelection();
        renderLinkInput();
    }
}

function onLinkCopy(event) {
    if (!isPanelVisible(PanelId.LINK)) return;
    if (!hasSelection()) return;
    const text = linkVirtualValue.slice(selectionStart(), selectionEnd());
    if (!text) return;
    event.preventDefault(); event.stopPropagation();
    event.clipboardData?.setData('text/plain', text);
    if (event.type === 'cut') {
        const start = selectionStart();
        linkVirtualValue = linkVirtualValue.slice(0, start) + linkVirtualValue.slice(selectionEnd());
        linkVirtualCursor = start;
        collapseSelection();
        renderLinkInput();
    }
}

function onLinkPaste(event) {
    if (!isPanelVisible(PanelId.LINK)) return;
    event.preventDefault(); event.stopPropagation();
    const text = (event.clipboardData?.getData('text/plain') || '').replace(/\s/g, '');
    // Replace the current selection (if any), otherwise insert at the caret.
    const start = selectionStart();
    const end = selectionEnd();
    linkVirtualValue = linkVirtualValue.slice(0, start) + text + linkVirtualValue.slice(end);
    linkVirtualCursor = start + text.length;
    collapseSelection();
    renderLinkInput();
}

function initLinkAction() {
    if (linkActionElement) return;
    linkActionElement = createPanelElement({
        styleId: 'text-format-link-action-styles',
        styles: LINK_ACTION_STYLES,
        html: LINK_ACTION_HTML,
    });

    linkActionElement.addEventListener('mousedown', (event) => {
        event.preventDefault();
        // Start a drag-selection inside the virtual link field (it isn't a real
        // <input>, so we emulate caret/selection from pointer coordinates).
        if (event.target.closest('#tft-link-url')) {
            linkActionElement.querySelector('#tft-link-url')?.classList.add('tla-focused');
            linkPointerDown(event.clientX);
            linkDragging = true;
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (linkDragging) linkPointerMove(event.clientX);
    });
    document.addEventListener('mouseup', () => { linkDragging = false; });

    linkActionElement.addEventListener('dblclick', (event) => {
        if (event.target.closest('#tft-link-url')) {
            event.preventDefault();
            selectAllLink();
        }
    });

    linkActionElement.addEventListener('click', (event) => {
        const labelElement = event.target.closest('.tft-link-newwindow');
        if (labelElement) {
            const checkbox = labelElement.querySelector('#tft-link-new-window');
            if (checkbox) checkbox.checked = !checkbox.checked;
        }
    });
}

function findAnchorInRange(range) {
    if (!range) return null;
    for (const container of [range.startContainer, range.endContainer]) {
        let node = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
        while (node && node !== document.body) {
            if (node.tagName === 'A') return node;
            node = node.parentNode;
        }
    }
    return null;
}

// A "source anchor" is an <a> rendered from JSX <a> or <Link> in the user's source
// (carries data-edit-url-attr). Its URL is editable in place by writing back to source.
// Distinct from toolbar-inserted anchors which only live inside the contenteditable.
function findSourceAnchorInRange(range) {
    if (!range) return null;
    for (const container of [range.startContainer, range.endContainer]) {
        let node = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
        while (node && node !== document.body) {
            if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-edit-url-attr')) return node;
            node = node.parentNode;
        }
    }
    return null;
}

function unwrapAnchor(anchor) {
    const parent = anchor.parentNode;
    while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
    parent.removeChild(anchor);
}

function applyLink(range, url, openNewTab) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.style.textDecoration = 'underline';
    if (openNewTab) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
    }
    try {
        range.surroundContents(anchor);
    } catch {
        anchor.appendChild(range.extractContents());
        range.insertNode(anchor);
    }

    const selection = window.getSelection();
    const newRange = document.createRange();
    newRange.selectNodeContents(anchor);
    selection.removeAllRanges();
    selection.addRange(newRange);
}

function saveLink() {
    const url = linkVirtualValue.trim();
    const newTab = linkActionElement.querySelector('#tft-link-new-window').checked;

    let range = savedLinkRange;

    // Source-anchor path: rendered <a>/<Link> from JSX. Update href in place and
    // persist the attribute edit. We must NOT unwrap — that destroys the contenteditable target.
    const sourceAnchor = findSourceAnchorInRange(range);
    if (sourceAnchor) {
        // Empty URL on a source anchor would break navigation; no "remove link" semantic
        // for source-attached anchors — leave as-is.
        if (!url) { hideLinkAction(); return; }

        const editId = sourceAnchor.getAttribute('data-edit-id');
        const urlAttribute = sourceAnchor.getAttribute('data-edit-url-attr');
        const oldUrl = sourceAnchor.getAttribute('href');

        if (oldUrl !== url && editId && urlAttribute) {
            const selectionMode = captureElementMetadata(sourceAnchor);
            sourceAnchor.setAttribute('href', url);
            recordEdit(editId, { beforeContent: oldUrl, afterContent: url }, { attribute: urlAttribute, element: sourceAnchor, selectionMode });
            notifyDraftStateChanged();
        }
        hideLinkAction();
        return;
    }

    // Inline anchor path: anchors that live only inside contenteditable HTML
    // (created/edited by the toolbar itself). Wrap/unwrap the DOM and let the
    // outer text edit's innerHTML diff carry the change to source on commit.
    const existing = findAnchorInRange(range);
    let changed = false;

    if (existing) {
        const children = Array.from(existing.childNodes);
        const entirelyInside = children.length > 0
            && existing.contains(range.startContainer)
            && existing.contains(range.endContainer);
        unwrapAnchor(existing);
        changed = true;
        if (entirelyInside) {
            range = document.createRange();
            range.setStartBefore(children[0]);
            range.setEndAfter(children[children.length - 1]);
        }
    }
    if (url && range) {
        applyLink(range, url, newTab);
        changed = true;
    }

    if (changed) {
        getEditing()?.targetElement?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    hideLinkAction();
}

export function positionLinkAction() {
    if (!isPanelVisible(PanelId.LINK) || !linkActionElement) return;
    positionDropdownPanel(linkActionElement, { matchToolbarWidth: true });
}

/** Opens the link panel prefilled from an existing anchor in the selection. */
export function showLinkAction() {
    if (!linkActionElement) initLinkAction();

    savedLinkRange = captureSelectionRange();

    const existing = findAnchorInRange(savedLinkRange);
    linkVirtualValue = existing ? (existing.getAttribute('href') || '') : '';
    linkVirtualCursor = linkVirtualValue.length;
    linkAnchor = linkVirtualValue.length;

    // Source anchors don't roundtrip target/rel back to JSX yet, so hide the
    // "open in new tab" checkbox to avoid a no-op control.
    const sourceAnchor = findSourceAnchorInRange(savedLinkRange);
    const newTabLabel = linkActionElement.querySelector('.tft-link-newwindow');
    if (newTabLabel) newTabLabel.style.display = sourceAnchor ? 'none' : '';
    linkActionElement.querySelector('#tft-link-new-window').checked = !sourceAnchor && existing ? existing.target === '_blank' : false;

    linkActionElement.classList.add('tla-visible');
    setPanelVisible(PanelId.LINK, true);
    linkActionElement.querySelector('#tft-link-url')?.classList.add('tla-focused');
    positionLinkAction();
    renderLinkInput();

    document.addEventListener('keydown', onLinkKeydown, true);
    document.addEventListener('paste', onLinkPaste, true);
    document.addEventListener('copy', onLinkCopy, true);
    document.addEventListener('cut', onLinkCopy, true);
    outsideDismiss.attach();
}

/** Closes the link panel and clears saved range. */
export function hideLinkAction() {
    if (!linkActionElement) return;
    linkActionElement.classList.remove('tla-visible');
    linkActionElement.querySelector('#tft-link-url')?.classList.remove('tla-focused');
    setPanelVisible(PanelId.LINK, false);
    savedLinkRange = null;
    linkAnchor = linkVirtualCursor;
    linkDragging = false;
    document.removeEventListener('keydown', onLinkKeydown, true);
    document.removeEventListener('paste', onLinkPaste, true);
    document.removeEventListener('copy', onLinkCopy, true);
    document.removeEventListener('cut', onLinkCopy, true);
    outsideDismiss.detach();
}

/** Toggles the link panel visibility. */
export function toggleLinkAction() {
    if (isPanelVisible(PanelId.LINK)) {
        hideLinkAction();
    } else {
        showLinkAction();
    }
}

registerPanel({ id: PanelId.LINK, hide: hideLinkAction });
