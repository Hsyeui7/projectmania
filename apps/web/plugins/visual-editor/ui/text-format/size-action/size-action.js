import { registerPanel, PanelId, setPanelVisible, isPanelVisible } from '../../../state/panel-state.js';
import { getToolbarTarget, stopFontSizeEdit } from '../toolbar/toolbar.js';
import { wrapSelectionWithStyle } from '../style-actions.js';
import { getStylesAtCursor, onSelectionChange } from '../../inline-edit/cursor-styles.js';
import { createPanelElement, positionDropdownPanel, createOutsideDismiss, captureSelectionRange } from '../dropdown-panel.js';
import { SIZE_ACTION_HTML } from './template.js';
import { SIZE_ACTION_STYLES } from './styles.js';

let sizeActionElement = null;
let savedSizeRange = null;

const outsideDismiss = createOutsideDismiss({
    getElement: () => sizeActionElement,
    dismiss: () => {
        stopFontSizeEdit();
        hideSizeAction();
    },
});

function initSizeAction() {
    if (sizeActionElement) return;
    sizeActionElement = createPanelElement({
        styleId: 'text-format-size-action-styles',
        styles: SIZE_ACTION_STYLES,
        html: SIZE_ACTION_HTML,
    });

    sizeActionElement.addEventListener('mousedown', (event) => event.preventDefault());

    sizeActionElement.addEventListener('click', (event) => {
        const option = event.target.closest('.tft-size-option');
        if (!option) return;
        applySizeAction(parseInt(option.dataset.size, 10));
        stopFontSizeEdit();
        hideSizeAction();
    });
}

export function positionSizeAction() {
    if (!isPanelVisible(PanelId.SIZE) || !sizeActionElement) return;
    positionDropdownPanel(sizeActionElement, { buttonAction: 'font-size' });
}

/** Saves the current selection range for a subsequent size apply. */
export function saveSizeRange() {
    const range = captureSelectionRange();
    if (range) savedSizeRange = range;
}

/**
 * Applies font size in pixels to the saved selection.
 * @param {number} pixels
 */
export function applySizeAction(pixels) {
    if (!savedSizeRange || !getToolbarTarget() || !(pixels > 0)) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedSizeRange);
    wrapSelectionWithStyle(getToolbarTarget(), 'fontSize', 'font-size', typeof pixels === 'number' ? `${pixels}px` : pixels);
    onSelectionChange();
}

/** Opens the font size panel with the current size highlighted. */
export function showSizeAction() {
    if (!sizeActionElement) initSizeAction();

    savedSizeRange = captureSelectionRange();

    const styles = getStylesAtCursor();
    const currentSize = Math.round(parseFloat(
        styles?.fontSize ?? getComputedStyle(getToolbarTarget()).fontSize
    ));
    sizeActionElement.querySelectorAll('.tft-size-option').forEach(option => {
        option.classList.toggle('tsa-active', Number(option.dataset.size) === currentSize);
    });

    sizeActionElement.classList.add('tsa-visible');
    setPanelVisible(PanelId.SIZE, true);
    positionSizeAction();

    outsideDismiss.attach();
}

/** Closes the font size panel. */
export function hideSizeAction() {
    if (!sizeActionElement) return;
    sizeActionElement.classList.remove('tsa-visible');
    setPanelVisible(PanelId.SIZE, false);
    savedSizeRange = null;
    outsideDismiss.detach();
}

/** Toggles the font size panel visibility. */
export function toggleSizeAction() {
    if (isPanelVisible(PanelId.SIZE)) {
        hideSizeAction();
    } else {
        showSizeAction();
    }
}

registerPanel({ id: PanelId.SIZE, hide: hideSizeAction });
