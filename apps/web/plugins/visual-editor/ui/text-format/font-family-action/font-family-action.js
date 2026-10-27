import { registerPanel, PanelId, setPanelVisible, isPanelVisible } from '../../../state/panel-state.js';
import { getToolbarTarget } from '../toolbar/toolbar.js';
import { wrapSelectionWithStyle } from '../style-actions.js';
import { getStylesAtCursor, onSelectionChange } from '../../inline-edit/cursor-styles.js';
import { createPanelElement, positionDropdownPanel, createOutsideDismiss, captureSelectionRange } from '../dropdown-panel.js';
import { SYSTEM_FONTS, FONT_ACTION_HTML } from './template.js';
import { FONT_ACTION_STYLES } from './styles.js';

let fontActionElement = null;
let savedFontRange = null;

const outsideDismiss = createOutsideDismiss({
    getElement: () => fontActionElement,
    dismiss: () => hideFontAction(),
});

function getAvailableFonts() {
    const fonts = [...SYSTEM_FONTS];
    const seen = new Set(SYSTEM_FONTS.map(font => font.name.toLowerCase()));
    document.fonts?.forEach(face => {
        if (face.status !== 'loaded') return;
        const family = face.family.replace(/^['"]|['"]$/g, '');
        const key = family.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const needsQuotes = /\s/.test(family);
        const quoted = needsQuotes ? `"${family}"` : family;
        fonts.push({ name: family, stack: `${quoted}, sans-serif` });
    });
    return fonts;
}

function renderFontOptions() {
    if (!fontActionElement) return;
    fontActionElement.innerHTML = getAvailableFonts()
        .map(font => `<div class="tft-font-option" data-font='${font.stack}' style='font-family: ${font.stack}'>${font.name}</div>`)
        .join('\n    ');
}

function initFontAction() {
    if (fontActionElement) return;
    fontActionElement = createPanelElement({
        styleId: 'text-format-font-action-styles',
        styles: FONT_ACTION_STYLES,
        html: FONT_ACTION_HTML,
    });

    fontActionElement.addEventListener('mousedown', (event) => event.preventDefault());

    fontActionElement.addEventListener('click', (event) => {
        const option = event.target.closest('.tft-font-option');
        if (!option) return;
        applyFontAction(option.dataset.font);
        hideFontAction();
    });
}

function applyFontAction(family) {
    if (!savedFontRange || !getToolbarTarget() || !family) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedFontRange);
    wrapSelectionWithStyle(getToolbarTarget(), 'fontFamily', 'font-family', family);
    onSelectionChange();
}

export function positionFontAction() {
    if (!isPanelVisible(PanelId.FONT) || !fontActionElement) return;
    positionDropdownPanel(fontActionElement, { buttonAction: 'font-family' });
}

/** Opens the font family panel with the current family highlighted. */
export function showFontAction() {
    if (!fontActionElement) initFontAction();
    renderFontOptions();

    savedFontRange = captureSelectionRange();

    const styles = getStylesAtCursor();
    const currentFamily = styles?.fontFamily
        ?? (getToolbarTarget() ? getComputedStyle(getToolbarTarget()).fontFamily : '');
    const normalizedCurrent = currentFamily.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    fontActionElement.querySelectorAll('.tft-font-option').forEach(option => {
        const optionName = option.dataset.font.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
        option.classList.toggle('tfa-active', optionName === normalizedCurrent);
    });

    fontActionElement.classList.add('tfa-visible');
    setPanelVisible(PanelId.FONT, true);
    positionFontAction();

    outsideDismiss.attach();
}

/** Closes the font family panel. */
export function hideFontAction() {
    if (!fontActionElement) return;
    fontActionElement.classList.remove('tfa-visible');
    setPanelVisible(PanelId.FONT, false);
    savedFontRange = null;
    outsideDismiss.detach();
}

/** Toggles the font family panel visibility. */
export function toggleFontAction() {
    if (isPanelVisible(PanelId.FONT)) {
        hideFontAction();
    } else {
        showFontAction();
    }
}

registerPanel({ id: PanelId.FONT, hide: hideFontAction });
