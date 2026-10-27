import { elementZIndex, isolateEditorUiEvents } from '../../../utils/dom-utils.js';
import { Z_OFFSET_TOOLBAR } from '../../../constants/theme.js';
import { hideLinkAction, toggleLinkAction, positionLinkAction } from '../link-action/link-action.js';
import { hideFontAction, toggleFontAction, positionFontAction } from '../font-family-action/font-family-action.js';
import { isPanelVisible, PanelId } from '../../../state/panel-state.js';
import { hideSizeAction, showSizeAction, toggleSizeAction, saveSizeRange, applySizeAction, positionSizeAction } from '../size-action/size-action.js';
import { hideColorAction, toggleColorAction, positionColorAction } from '../color-action/color-action.js';
import { applyBold, applyItalic, applyUnderline, applyAlign } from '../style-actions.js';
import { onSelectionChange } from '../../inline-edit/cursor-styles.js';
import { placeCursorAtEnd } from '../../inline-edit/edit-action.js';
import { TOOLBAR_HTML, ALIGN_ICONS } from './template.js';
import { TOOLBAR_STYLES } from './styles.js';
import {
    setPositioningEl, setPositioningTarget, resetDragOffset,
    lockToolbarSide, positionToolbar, startDrag, isToolbarFixedToViewport,
} from './positioning.js';
import { openOrCreateAnnotation, getAnnotationPanelEl, hideAnnotationPanel } from '../../annotation-panel/panel.js';
import { getEditorTranslations } from '../../../state/annotation-state.js';
import { PANEL_GAP, PANEL_MARGIN, PARENT_TOOLBAR_HEIGHT, ANNOTATION_PANEL_WIDTH, ANNOTATION_PANEL_ESTIMATED_HEIGHT } from '../../../constants/layout.js';

let toolbarElement = null;
let toolbarTarget = null;
let toolbarResizeObserver = null;
let toolbarMutationObserver = null;
let windowResizeListener = null;
let repositionAnimationFrameId = null;

let fontSizeEditing = false;
let fontSizeOriginal = '';

function onFontSizeKeydown(event) {
    const span = toolbarElement?.querySelector('.tft-font-size');
    if (!span) return;
    if (/^\d$/.test(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (span.textContent.length < 3) span.textContent += event.key;
    } else if (event.key === 'Backspace') {
        event.preventDefault(); event.stopPropagation();
        span.textContent = span.textContent.slice(0, -1);
    } else if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
        applySizeAction(parseInt(span.textContent, 10));
        stopFontSizeEdit();
        hideSizeAction();
    } else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        span.textContent = fontSizeOriginal;
        stopFontSizeEdit();
        hideSizeAction();
    }
}

function startFontSizeEdit() {
    if (fontSizeEditing) return;
    const span = toolbarElement?.querySelector('.tft-font-size');
    if (!span) return;
    fontSizeEditing = true;
    fontSizeOriginal = span.textContent;
    span.textContent = '';
    span.classList.add('tft-font-size--editing');
    saveSizeRange();
    document.addEventListener('keydown', onFontSizeKeydown, true);
}

/** Ends inline font-size keyboard editing on the toolbar label. */
export function stopFontSizeEdit() {
    if (!fontSizeEditing) return;
    fontSizeEditing = false;
    const span = toolbarElement?.querySelector('.tft-font-size');
    if (span) {
        span.classList.remove('tft-font-size--editing');
        if (!span.textContent) span.textContent = fontSizeOriginal;
    }
    document.removeEventListener('keydown', onFontSizeKeydown, true);
}

/** @returns {HTMLElement|null} */
export function getToolbarEl()     { return toolbarElement; }
/** @returns {HTMLElement|null} The element currently being formatted. */
export function getToolbarTarget() { return toolbarTarget; }

function restoreSelectionAndCloseLinkPanel() {
    if (!isPanelVisible(PanelId.LINK)) return;
    hideLinkAction();
}

function repositionAttachedPanels() {
    positionColorAction();
    positionFontAction();
    positionSizeAction();
    positionLinkAction();
    repositionAnnotationToToolbar();
}

function repositionAnnotationToToolbar() {
    const panel = getAnnotationPanelEl();
    if (!panel?.classList.contains('active') || !toolbarElement) return;
    if (panel.style.position === 'absolute') return;
    const rect = toolbarElement.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + PANEL_GAP;

    if (left + ANNOTATION_PANEL_WIDTH > window.innerWidth - PANEL_MARGIN) {
        left = window.innerWidth - ANNOTATION_PANEL_WIDTH - PANEL_MARGIN;
    }
    if (left < PANEL_MARGIN) left = PANEL_MARGIN;
    if (top + ANNOTATION_PANEL_ESTIMATED_HEIGHT > window.innerHeight - PARENT_TOOLBAR_HEIGHT - PANEL_MARGIN) {
        top = rect.top - ANNOTATION_PANEL_ESTIMATED_HEIGHT - PANEL_GAP;
    }
    if (top < PANEL_MARGIN) top = PANEL_MARGIN;

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

function repositionEditOverlays() {
    if (!toolbarTarget || !toolbarElement?.classList.contains('tft-visible')) return;
    positionToolbar();
    repositionAttachedPanels();
}

/** Repositions toolbar and open sub-panels after the edit target changes size. */
export function scheduleRepositionEditOverlays() {
    if (repositionAnimationFrameId) cancelAnimationFrame(repositionAnimationFrameId);
    repositionAnimationFrameId = requestAnimationFrame(() => {
        repositionAnimationFrameId = null;
        repositionEditOverlays();
    });
}

function observeToolbarTarget() {
    disconnectToolbarTargetObserver();
    if (!toolbarTarget) return;

    if (typeof ResizeObserver !== 'undefined') {
        toolbarResizeObserver = new ResizeObserver(scheduleRepositionEditOverlays);
        toolbarResizeObserver.observe(toolbarTarget);
    }

    if (typeof MutationObserver !== 'undefined') {
        toolbarMutationObserver = new MutationObserver(scheduleRepositionEditOverlays);
        toolbarMutationObserver.observe(toolbarTarget, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    windowResizeListener = () => scheduleRepositionEditOverlays();
    window.addEventListener('resize', windowResizeListener, { passive: true });
}

function disconnectToolbarTargetObserver() {
    toolbarResizeObserver?.disconnect();
    toolbarResizeObserver = null;
    toolbarMutationObserver?.disconnect();
    toolbarMutationObserver = null;
    if (windowResizeListener) {
        window.removeEventListener('resize', windowResizeListener);
        windowResizeListener = null;
    }
    if (repositionAnimationFrameId) {
        cancelAnimationFrame(repositionAnimationFrameId);
        repositionAnimationFrameId = null;
    }
}

function onToolbarScroll() {
    toolbarElement?.querySelector('.tft-more-panel')?.classList.remove('tft-open');

    if (isToolbarFixedToViewport()) {
        // The element lives in a fixed/sticky ancestor, so it stays in the
        // viewport while the page scrolls; keep the viewport-anchored toolbar
        // and its panels aligned to it.
        repositionEditOverlays();
        return;
    }

    // Document-flow element: the absolutely-positioned toolbar scrolls with the
    // page natively (no reposition needed, so no bounce). Only realign open
    // sub-panels, which are viewport-fixed and anchored to the toolbar.
    repositionAttachedPanels();
}

function initToolbar() {
    if (toolbarElement) return;

    const style = document.createElement('style');
    style.id = 'text-format-toolbar-styles';
    style.textContent = TOOLBAR_STYLES;
    document.head.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = TOOLBAR_HTML;
    toolbarElement = wrapper.firstElementChild;
    document.body.appendChild(toolbarElement);
    isolateEditorUiEvents(toolbarElement);

    const editWithAiLabel = getEditorTranslations().toolbarEditWithAi;
    if (editWithAiLabel) {
        const labelSpan = toolbarElement.querySelector('[data-action="edit-with-ai"] .tft-text-btn-label');
        if (labelSpan) labelSpan.textContent = editWithAiLabel;
    }

    setPositioningEl(toolbarElement);

    toolbarElement.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (event.target.closest('[data-action]')) return;
        hideFontAction();
        hideLinkAction();
        hideSizeAction();
        hideColorAction(true);
        startDrag(event);
    });

    toolbarElement.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button || !toolbarTarget) return;

        const action = button.dataset.action;
        const opensDropdownPanel = action === 'color' || action === 'font-family' || action === 'font-size' || action === 'link';

        if (action !== 'font-family') hideFontAction();
        if (action !== 'font-size') { hideSizeAction(); stopFontSizeEdit(); }
        if (action !== 'color') hideColorAction();
        if (action !== 'link') restoreSelectionAndCloseLinkPanel();
        if (action !== 'edit-with-ai') {
            const annotationWasOpen = getAnnotationPanelEl()?.classList.contains('active');
            // Skip the focus/caret restore when opening another dropdown panel —
            // it fires a selectionchange event that would immediately close the
            // panel this same click is about to open.
            hideAnnotationPanel({ restoreFocus: !opensDropdownPanel });
            if (annotationWasOpen && toolbarTarget && !opensDropdownPanel) {
                toolbarTarget.focus();
                placeCursorAtEnd(toolbarTarget);
            }
        }

        switch (action) {
            case 'color':       toggleColorAction(); break;
            case 'font-family': toggleFontAction(); break;
            case 'more':
                toolbarElement.querySelector('.tft-more-panel')?.classList.toggle('tft-open');
                break;
            case 'font-size':
                if (event.target.closest('.tft-font-size')) {
                    showSizeAction();
                    startFontSizeEdit();
                } else {
                    stopFontSizeEdit();
                    toggleSizeAction();
                }
                break;
            case 'bold':      applyBold(toolbarTarget);      onSelectionChange(true); break;
            case 'italic':    applyItalic(toolbarTarget);    onSelectionChange(true); break;
            case 'underline': applyUnderline(toolbarTarget); onSelectionChange(true); break;
            case 'align': {
                const current = getComputedStyle(toolbarTarget).textAlign;
                const next = current === 'left' || current === 'start' ? 'center'
                    : current === 'center' ? 'right'
                    : 'left';
                applyAlign(toolbarTarget, next);
                onSelectionChange(true);
                break;
            }
            case 'link': toggleLinkAction(); break;
            case 'edit-with-ai': {
                const target = toolbarTarget;
                if (!target) break;

                if (getAnnotationPanelEl()?.classList.contains('active')) {
                    hideAnnotationPanel();
                    break;
                }

                const toolbarRect = toolbarElement.getBoundingClientRect();
                openOrCreateAnnotation(target, toolbarRect.left, toolbarRect.bottom, toolbarRect.top);
                break;
            }
        }
    });
}

/**
 * Shows and positions the toolbar for the given edit target.
 * @param {HTMLElement} targetElement
 */
export function showTextFormatToolbar(targetElement) {
    if (!toolbarElement) initToolbar();
    else if (!toolbarElement.isConnected) document.body.appendChild(toolbarElement);
    toolbarTarget = targetElement;
    setPositioningTarget(targetElement);
    resetDragOffset();
    toolbarElement.classList.add('tft-visible');
    toolbarElement.style.zIndex = elementZIndex(targetElement) + Z_OFFSET_TOOLBAR;
    lockToolbarSide();
    positionToolbar();
    observeToolbarTarget();
    document.addEventListener('scroll', onToolbarScroll, true);
}

/** Hides the toolbar and all sub-panels. */
export function hideTextFormatToolbar() {
    if (!toolbarElement) return;
    toolbarElement.classList.remove('tft-visible');
    toolbarElement.querySelector('.tft-more-panel')?.classList.remove('tft-open');
    hideFontAction();
    hideLinkAction();
    hideSizeAction();
    hideColorAction(true);
    stopFontSizeEdit();
    toolbarTarget = null;
    setPositioningTarget(null);
    disconnectToolbarTargetObserver();
    document.removeEventListener('scroll', onToolbarScroll, true);
}

/**
 * Syncs toolbar controls to styles reported at the caret.
 * @param {object} styles - From getStylesAtCursor().
 */
export function updateTextFormatToolbar(styles) {
    if (!toolbarElement?.classList.contains('tft-visible')) return;

    const swatch = toolbarElement.querySelector('.tft-swatch-preview');
    if (swatch) swatch.style.background = styles.color;

    const fontFamilyLabel = toolbarElement.querySelector('.tft-font-family');
    if (fontFamilyLabel) {
        fontFamilyLabel.textContent = styles.fontFamily
            .split(',')[0]
            .replace(/['"]/g, '')
            .trim();
    }

    const fontSizeLabel = toolbarElement.querySelector('.tft-font-size');
    if (fontSizeLabel && !fontSizeEditing) {
        fontSizeLabel.textContent = String(Math.round(parseFloat(styles.fontSize)));
    }

    const isBold      = !!styles.isBold;
    const isItalic    = !!styles.isItalic;
    const isUnderline = !!styles.isUnderline;
    const align = styles.textAlign === 'center' ? 'center'
        : styles.textAlign === 'right'  ? 'right'
        : 'left';

    toolbarElement.querySelectorAll('[data-action="bold"]').forEach(button =>
        button.classList.toggle('tft-active', isBold));
    toolbarElement.querySelectorAll('[data-action="italic"]').forEach(button =>
        button.classList.toggle('tft-active', isItalic));
    toolbarElement.querySelectorAll('[data-action="underline"]').forEach(button =>
        button.classList.toggle('tft-active', isUnderline));
    toolbarElement.querySelectorAll('[data-action="align"]').forEach(button => {
        button.innerHTML = ALIGN_ICONS[align];
    });
}
