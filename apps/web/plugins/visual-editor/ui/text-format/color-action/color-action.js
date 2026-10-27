import { registerPanel, PanelId, setPanelVisible, isPanelVisible } from '../../../state/panel-state.js';
import { getToolbarEl, getToolbarTarget } from '../toolbar/toolbar.js';
import { createPanelElement, positionDropdownPanel, createOutsideDismiss, captureSelectionRange } from '../dropdown-panel.js';
import { getActiveRange, wrapRange, syncUnderlineColorFromElement } from '../style-actions.js';
import { getStylesAtCursor, onSelectionChange } from '../../inline-edit/cursor-styles.js';
import { COLOR_ACTION_HTML, SOLID_COLORS, GRADIENTS } from './template.js';
import { COLOR_ACTION_STYLES } from './styles.js';
import { hsvToHex, hsvToColor, hexToHsv, parseHexInput, parseColor, extractAlpha } from './color-conversions.js';
import { parseGradientStops, buildGradient } from './gradient.js';
import {
    initSwatches, syncSolidSwatchActive, syncGradientSwatchActive,
    ensureCustomSwatch, ensureCustomGradientSwatch,
    appendCustomSwatch, appendCustomGradientSwatch, restorePersistedSwatches,
    recolorSolidSwatch, recolorGradientSwatch, setActiveSwatch,
} from './swatches.js';
import { initHexInput, setHexFromPicker, setHexInputActive, hexPointerDown, hexPointerMove, handleHexKeydown, handleHexPaste, handleHexCopy, selectAllHex } from './hex-input.js';
import { initPickerSquare } from './picker-square.js';

let colorActionElement = null;
let savedColorRange = null;

let pickerHue = 0, pickerSaturation = 1, pickerValue = 1, pickerAlpha = 1;
let pickerOnChange = null;
export let pickerDragging = false;
let hexDragging = false;
let activeSwatchOption = null;
let lastColorWrapper = null;
let _suppressHide = false;
let _colorEdited = false;
let _pickerSquare = null, _pickerIndicator = null;
let _pickerHueInput = null, _pickerAlphaInput = null;
let _eyedropperPickAbort = null;

let gradientColors = ['#FF6B6B', '#FFE66D'];
let gradientAngle = 90;
let activeGradientStop = 0;

/**
 * Runs `handler` with pickerDragging forced on (so live previews skip expensive
 * input events), restoring the previous flag afterwards.
 * @param {() => void} handler
 */
function withPickerDragging(handler) {
    const wasDragging = pickerDragging;
    pickerDragging = true;
    try {
        handler();
    } finally {
        pickerDragging = wasDragging;
    }
}

/** Applies a solid color to a wrapper element, clearing gradient props. */
function setWrapperSolid(element, color) {
    element.style.color = color;
    element.style.removeProperty('background-image');
    element.style.removeProperty('background-clip');
    element.style.removeProperty('-webkit-background-clip');
}

/** Applies a gradient text fill to a wrapper element. */
function setWrapperGradient(element, gradient) {
    element.style.backgroundImage = gradient;
    element.style.backgroundClip = 'text';
    element.style.webkitBackgroundClip = 'text';
    element.style.color = 'transparent';
}

/** Updates the toolbar's color swatch preview. */
function setToolbarPreview(value) {
    getToolbarEl()?.querySelector('.tft-swatch-preview')?.style.setProperty('background', value);
}

/**
 * Commits a solid color: restyles the existing wrapper when connected,
 * otherwise wraps the saved selection silently (no input event).
 * @param {string} color
 */
function applySolidFull(color) {
    if (lastColorWrapper?.isConnected) {
        setWrapperSolid(lastColorWrapper, color);
    } else {
        withPickerDragging(() => applyColorAction(color, false));
    }
}

/**
 * Commits a gradient like {@link applySolidFull}, re-resolving the wrapper
 * after a fresh wrap so subsequent live updates can target it.
 * @param {string} gradient
 */
function applyGradientFull(gradient) {
    recoverGradientWrapper();
    if (lastColorWrapper?.isConnected) {
        setWrapperGradient(lastColorWrapper, gradient);
    } else {
        withPickerDragging(() => applyColorAction(gradient, true));
        recoverGradientWrapper();
    }
}

function isGradientTabActive() {
    return !!colorActionElement?.querySelector('.tft-color-tab[data-tab="gradient"]')?.classList.contains('tca-tab-active');
}

function refreshGradientStopSwatches() {
    if (!colorActionElement) return;
    [0, 1].forEach(index => {
        const element = colorActionElement.querySelector(`.tft-gradient-stop-swatch[data-stop="${index}"]`);
        if (!element) return;
        element.querySelector('.tft-color-swatch').style.background = gradientColors[index] || '#000000';
        element.classList.toggle('tca-active', index === activeGradientStop);
    });
}

function selectGradientStop(stopIndex) {
    activeGradientStop = stopIndex;
    refreshGradientStopSwatches();
    const hex = parseColor(gradientColors[stopIndex]) || '#000000';
    seedPicker(hex);
}

function updatePickerUI(skipHex = false) {
    const hex = hsvToHex(pickerHue, pickerSaturation, pickerValue);
    if (isGradientTabActive()) {
        gradientColors[activeGradientStop] = hex;
        refreshGradientStopSwatches();
        const gradient = buildGradient(gradientAngle, gradientColors[0], gradientColors[1]);
        if (canApplyColor()) {
            recoverGradientWrapper();
            if (lastColorWrapper?.isConnected) {
                lastColorWrapper.style.backgroundImage = gradient;
            }
        }
        setToolbarPreview(gradient);
        // Edit the selected gradient swatch in place (keeps it highlighted); otherwise just highlight a match.
        if (activeSwatchOption?.isConnected && activeSwatchOption.hasAttribute('data-gradient')) {
            recolorGradientSwatch(activeSwatchOption, gradient);
            setActiveSwatch(activeSwatchOption);
        } else {
            activeSwatchOption = syncGradientSwatchActive(gradient);
        }
    } else if (activeSwatchOption?.isConnected && activeSwatchOption.hasAttribute('data-color')) {
        recolorSolidSwatch(activeSwatchOption, hex);
        setActiveSwatch(activeSwatchOption);
    } else {
        activeSwatchOption = syncSolidSwatchActive(hex);
    }
    if (_pickerSquare) _pickerSquare.style.background = `hsl(${pickerHue}, 100%, 50%)`;
    if (_pickerIndicator) {
        const width = _pickerSquare.offsetWidth;
        const height = _pickerSquare.offsetHeight;
        _pickerIndicator.style.left = `${pickerSaturation * width}px`;
        _pickerIndicator.style.top  = `${(1 - pickerValue) * height}px`;
        _pickerIndicator.style.background = hex;
    }
    if (_pickerHueInput) _pickerHueInput.value = pickerHue;
    if (_pickerAlphaInput) {
        const hslColor = `hsl(${pickerHue}, 100%, 50%)`;
        _pickerAlphaInput.style.background = [
            `linear-gradient(to right, transparent, ${hslColor})`,
            `linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%) 0 0 / 8px 8px`,
            `linear-gradient(45deg, #555 25%, transparent 25%, transparent 75%, #555 75%) 4px 4px / 8px 8px`,
            `#2a2b2f`,
        ].join(', ');
    }
    if (!skipHex) setHexFromPicker(hex);
}

function seedPicker(hex) {
    const hsv = hexToHsv(hex) ?? { h: 0, s: 0, v: 0 };
    pickerHue = hsv.h;
    pickerSaturation = hsv.s;
    pickerValue = hsv.v;
    updatePickerUI();
}

function findGradientWrapper() {
    if (!getToolbarTarget()) return null;
    const selection = window.getSelection();
    let node = selection?.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
    if (!node) node = savedColorRange?.commonAncestorContainer;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    while (node && node !== getToolbarTarget().parentElement) {
        if (node === getToolbarTarget()) { node = node.parentElement; continue; }
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.style?.backgroundClip === 'text' || node.style?.webkitBackgroundClip === 'text') {
                return node;
            }
            try {
                const computedStyle = getComputedStyle(node);
                const backgroundClip = computedStyle.backgroundClip || computedStyle.webkitBackgroundClip;
                if (computedStyle.backgroundImage?.includes('gradient') && backgroundClip === 'text') {
                    return node;
                }
            } catch { /* ignore */ }
        }
        node = node.parentElement;
    }
    return null;
}

function recoverGradientWrapper() {
    if (lastColorWrapper?.isConnected) return;
    lastColorWrapper = findGradientWrapper();
    if (lastColorWrapper) {
        try {
            const range = document.createRange();
            range.selectNodeContents(lastColorWrapper);
            savedColorRange = range.cloneRange();
        } catch { /* ignore */ }
    }
}

function applyLive(color) {
    if (isGradientTabActive()) {
        gradientColors[activeGradientStop] = color;
        refreshGradientStopSwatches();
        const gradient = buildGradient(gradientAngle, gradientColors[0], gradientColors[1]);
        if (canApplyColor()) {
            recoverGradientWrapper();
            if (lastColorWrapper?.isConnected) {
                lastColorWrapper.style.backgroundImage = gradient;
            } else {
                withPickerDragging(() => applyColorAction(gradient, true));
            }
        }
        setToolbarPreview(gradient);
    } else {
        if (canApplyColor()) {
            if (lastColorWrapper?.isConnected) {
                lastColorWrapper.style.color = color;
            } else {
                withPickerDragging(() => applyColorAction(color, false));
            }
        }
        setToolbarPreview(color);
    }
}

function notifyChange() {
    if (!getToolbarTarget()) return;
    // Swatches are only created via the "+" button now, never auto-added on commit.
    getToolbarTarget().dispatchEvent(new CustomEvent('tft-color-commit', { bubbles: true }));
}

function applyColorAction(value, isGradient) {
    if (!savedColorRange || !getToolbarTarget() || !value) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedColorRange);
    applyColor(getToolbarTarget(), value, isGradient);
    if (selection.rangeCount > 0) savedColorRange = selection.getRangeAt(0).cloneRange();
    if (!pickerDragging) onSelectionChange();
}

function stripColorProps(element) {
    element.style.removeProperty('color');
    element.style.removeProperty('background-image');
    element.style.removeProperty('background-clip');
    element.style.removeProperty('-webkit-background-clip');
}

function hasColorProps(element) {
    return !!(element.style.color || element.style.backgroundImage || element.style.backgroundClip || element.style.webkitBackgroundClip);
}

function findReusableAncestor(range, editTarget) {
    let element = range.commonAncestorContainer;
    if (element.nodeType === Node.TEXT_NODE) element = element.parentElement;
    while (element && element !== editTarget) {
        if (element.nodeType === Node.ELEMENT_NODE) {
            try {
                const elementRange = document.createRange();
                elementRange.selectNodeContents(element);
                const selectionText = range.toString();
                const elementText = elementRange.toString();
                if (selectionText && elementText && selectionText === elementText) return element;
            } catch { /* ignore */ }
        }
        element = element.parentElement;
    }
    return null;
}

function splitParentAroundWrapper(wrapper, parent, styleProperties, isGradient) {
    const parentParent = parent.parentNode;
    if (!parentParent) return;

    const before = parent.cloneNode(false);
    const after  = parent.cloneNode(false);

    let node = parent.firstChild;
    while (node && node !== wrapper) {
        const next = node.nextSibling;
        before.appendChild(node);
        node = next;
    }
    node = wrapper.nextSibling;
    while (node) {
        const next = node.nextSibling;
        after.appendChild(node);
        node = next;
    }
    parent.removeChild(wrapper);

    // Inherit parent styles then apply new color
    wrapper.style.cssText = parent.style.cssText;
    Object.assign(wrapper.style, styleProperties);
    if (!isGradient) {
        wrapper.style.removeProperty('background-image');
        wrapper.style.removeProperty('background-clip');
        wrapper.style.removeProperty('-webkit-background-clip');
    }

    if (before.hasChildNodes()) parentParent.insertBefore(before, parent);
    parentParent.insertBefore(wrapper, parent);
    if (after.hasChildNodes()) parentParent.insertBefore(after, parent);
    parentParent.removeChild(parent);
}

function applyColor(editTarget, value, isGradient) {
    const range = getActiveRange(editTarget);
    if (!range) return;
    const styleProperties = isGradient
        ? { backgroundImage: value, backgroundClip: 'text', webkitBackgroundClip: 'text', color: 'transparent' }
        : { color: value };

    const reuse = findReusableAncestor(range, editTarget);
    if (reuse) {
        Object.assign(reuse.style, styleProperties);
        if (!isGradient) {
            reuse.style.removeProperty('background-image');
            reuse.style.removeProperty('background-clip');
            reuse.style.removeProperty('-webkit-background-clip');
        }
        lastColorWrapper = reuse;
        reuse.querySelectorAll('*').forEach(element => {
            if (hasColorProps(element)) stripColorProps(element);
        });
        syncUnderlineColorFromElement(reuse, editTarget);
        if (!pickerDragging) editTarget.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    const wrapper = wrapRange(range, 'span', styleProperties);
    lastColorWrapper = wrapper ?? null;
    if (wrapper) {
        wrapper.querySelectorAll('*').forEach(element => {
            if (hasColorProps(element)) stripColorProps(element);
        });
        const parent = wrapper.parentElement;
        if (parent && parent !== editTarget && parent.tagName === 'SPAN' && hasColorProps(parent)) {
            const parentRange = document.createRange();
            parentRange.selectNodeContents(parent);
            if (parentRange.toString() === wrapper.textContent) {
                stripColorProps(parent);
            } else {
                splitParentAroundWrapper(wrapper, parent, styleProperties, isGradient);
            }
        }
        syncUnderlineColorFromElement(wrapper, editTarget);
    }
    if (!pickerDragging) {
        requestAnimationFrame(() => {
            editTarget.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }
}

export function positionColorAction() {
    if (!isPanelVisible(PanelId.COLOR) || !colorActionElement) return;
    positionDropdownPanel(colorActionElement, { buttonAction: 'color' });
}

const outsideDismiss = createOutsideDismiss({
    getElement: () => colorActionElement,
    dismiss: () => {
        _suppressHide = false;
        hideColorAction();
    },
    ignoreToolbar: false,
    ignoreMouseDown: (event) => !!event.target.closest('[data-action="color"]'),
    captureMouseDown: true,
});

/**
 * @returns {boolean} Whether color can be applied to content. A highlighted
 * range colors that selection; a collapsed caret inside the edit target colors
 * the whole element (same as bold/italic via {@link getActiveRange}).
 */
function canApplyColor() {
    if (!savedColorRange || !getToolbarTarget()) return false;
    if (!savedColorRange.collapsed) return true;
    return getToolbarTarget().contains(savedColorRange.commonAncestorContainer);
}

/** True only when the user has highlighted text (not a bare caret). */
function hasExpandedTextSelection() {
    return !!savedColorRange && !savedColorRange.collapsed;
}

function onSelectionChangeForColor() {
    if (!isPanelVisible(PanelId.COLOR)) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!getToolbarTarget()?.contains(range.commonAncestorContainer)) return;
    savedColorRange = range.cloneRange();
}

function switchColorTab(tab) {
    if (!colorActionElement) return;
    colorActionElement.querySelectorAll('.tft-color-tab').forEach(tabElement =>
        tabElement.classList.toggle('tca-tab-active', tabElement.dataset.tab === tab));
    colorActionElement.querySelectorAll('[data-tab-panel]').forEach(panelElement =>
        panelElement.classList.toggle('tca-hidden', panelElement.dataset.tabPanel !== tab));

    if (tab === 'gradient' && isPanelVisible(PanelId.COLOR)) {
        const firstPreset = parseGradientStops(GRADIENTS[0]);
        if (firstPreset) {
            gradientAngle = firstPreset.angle;
            gradientColors = firstPreset.colors.map(color => parseColor(color) || color);
        }
        refreshGradientStopSwatches();
        selectGradientStop(0);
        activeSwatchOption = syncGradientSwatchActive(GRADIENTS[0]);
        if (hasExpandedTextSelection() && getToolbarTarget()) {
            applyGradientFull(GRADIENTS[0]);
            notifyChange();
        }
        setToolbarPreview(GRADIENTS[0]);
    } else if (tab === 'solid' && isPanelVisible(PanelId.COLOR)) {
        const defaultSolid = SOLID_COLORS[0];
        seedPicker(defaultSolid);
        activeSwatchOption = syncSolidSwatchActive(defaultSolid);
        syncGradientSwatchActive(null);
        if (hasExpandedTextSelection() && getToolbarTarget()) {
            recoverGradientWrapper();
            applySolidFull(defaultSolid);
            notifyChange();
        }
        setToolbarPreview(defaultSolid);
    }

    positionColorAction();
}

function initColorAction() {
    if (colorActionElement) return;
    colorActionElement = createPanelElement({
        styleId: 'text-format-color-action-styles',
        styles: COLOR_ACTION_STYLES,
        html: COLOR_ACTION_HTML,
    });

    initSwatches(colorActionElement);
    restorePersistedSwatches();

    colorActionElement.addEventListener('mousedown', (event) => {
        if (event.target.closest('input[type="range"]')) return;
        event.preventDefault();
        if (event.target.closest('.tft-picker-hex-input')) {
            setHexInputActive(true);
            hexPointerDown(event.clientX);
            hexDragging = true;
        }
    });

    document.addEventListener('mousemove', (event) => {
        if (hexDragging) hexPointerMove(event.clientX);
    });
    document.addEventListener('mouseup', () => { hexDragging = false; });

    _pickerSquare    = colorActionElement.querySelector('.tft-picker-square');
    _pickerIndicator = colorActionElement.querySelector('.tft-picker-indicator');
    _pickerHueInput  = colorActionElement.querySelector('.tft-picker-hue');
    _pickerAlphaInput = colorActionElement.querySelector('.tft-picker-alpha');
    const hexElement      = colorActionElement.querySelector('.tft-picker-hex-input');
    initHexInput(hexElement);

    initPickerSquare(_pickerSquare, {
        onDragStart: (saturation, value) => {
            pickerDragging = true;
            _colorEdited = true;
            if (canApplyColor() && !lastColorWrapper?.isConnected) {
                if (isGradientTabActive()) {
                    applyColorAction(buildGradient(gradientAngle, gradientColors[0], gradientColors[1]), true);
                } else {
                    applyColorAction(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha), false);
                }
            }
            pickerSaturation = saturation; pickerValue = value;
            updatePickerUI();
        },
        onPickChange: (saturation, value) => {
            if (!pickerDragging) return;
            pickerSaturation = saturation; pickerValue = value;
            updatePickerUI();
            applyLive(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha));
        },
        onDragEnd: () => {
            pickerDragging = false;
            notifyChange();
        },
    });

    _pickerHueInput.addEventListener('input', () => {
        _colorEdited = true;
        pickerHue = Number(_pickerHueInput.value);
        updatePickerUI();
        applyLive(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha));
    });
    _pickerHueInput.addEventListener('change', () => notifyChange());

    _pickerAlphaInput.addEventListener('input', () => {
        _colorEdited = true;
        pickerAlpha = Number(_pickerAlphaInput.value) / 100;
        updatePickerUI(true);
        applyLive(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha));
    });
    _pickerAlphaInput.addEventListener('change', () => notifyChange());

    const eyedropperButton = colorActionElement.querySelector('.tft-picker-hex-picker');
    if (eyedropperButton) {
        if (!('EyeDropper' in window)) {
            eyedropperButton.style.display = 'none';
        } else {
            eyedropperButton.addEventListener('click', async (event) => {
                event.stopPropagation();
                _suppressHide = true;
                _eyedropperPickAbort?.abort();
                _eyedropperPickAbort = new AbortController();
                try {
                    const { sRGBHex } = await new window.EyeDropper().open({ signal: _eyedropperPickAbort.signal });
                    const parsed = parseHexInput(sRGBHex);
                    if (!parsed) return;
                    _colorEdited = true;
                    seedPicker(parsed);
                    applyLive(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha));
                    notifyChange();
                } catch (error) {
                    if (error?.name !== 'AbortError') console.warn('EyeDropper failed', error);
                } finally {
                    _eyedropperPickAbort = null;
                    requestAnimationFrame(() => { _suppressHide = false; });
                }
            });
        }
    }

    colorActionElement.addEventListener('dblclick', (event) => {
        if (event.target.closest('.tft-picker-hex-input')) {
            event.preventDefault();
            selectAllHex();
        }
    });

    colorActionElement.addEventListener('click', (event) => {
        const tab = event.target.closest('.tft-color-tab');
        if (tab) {
            switchColorTab(tab.dataset.tab);
            return;
        }

        if (event.target.closest('.tft-picker-hex-input')) return;
        const stopSwatch = event.target.closest('.tft-gradient-stop-swatch');
        if (stopSwatch) {
            selectGradientStop(Number(stopSwatch.dataset.stop));
            return;
        }

        const addButton = event.target.closest('.tft-color-add');
        if (addButton) {
            _colorEdited = true;
            if (isGradientTabActive()) {
                const gradient = activeSwatchOption?.dataset.gradient
                    || buildGradient(gradientAngle, gradientColors[0], gradientColors[1]);
                const newSwatch = appendCustomGradientSwatch(gradient);
                if (newSwatch) { activeSwatchOption = newSwatch; setActiveSwatch(newSwatch); }
                setToolbarPreview(gradient);
            } else {
                const hex = activeSwatchOption?.dataset.color
                    || hsvToHex(pickerHue, pickerSaturation, pickerValue);
                const newSwatch = appendCustomSwatch(hex);
                if (newSwatch) { activeSwatchOption = newSwatch; setActiveSwatch(newSwatch); }
                setToolbarPreview(hex);
            }
            return;
        }

        const option = event.target.closest('.tft-color-option');
        if (!option) return;

        if (option.dataset.gradient) {
            const gradient = option.dataset.gradient;
            activeSwatchOption = option;
            setActiveSwatch(option);
            const parsed = parseGradientStops(gradient);
            if (parsed) {
                gradientAngle = parsed.angle;
                gradientColors = [...parsed.colors];
            }
            refreshGradientStopSwatches();
            selectGradientStop(0);
            if (canApplyColor()) applyGradientFull(gradient);
            setToolbarPreview(gradient);
            notifyChange();
        } else {
            const hex = option.dataset.color;
            activeSwatchOption = option;
            setActiveSwatch(option);
            seedPicker(hex);
            if (canApplyColor()) applySolidFull(hex);
            setToolbarPreview(hex);
            notifyChange();
        }
    });
}

function tryLiveFromHex(rawValue) {
    const hex = parseHexInput(rawValue);
    if (!hex) return;
    _colorEdited = true;
    const hsv = hexToHsv(hex);
    if (!hsv) return;
    pickerHue = hsv.h; pickerSaturation = hsv.s; pickerValue = hsv.v;
    updatePickerUI(true);
    applyLive(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha));
}

function onHexCommit(hex) {
    seedPicker(hex);
    _suppressHide = false;
    if (isGradientTabActive()) {
        applyLive(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha));
    } else {
        pickerOnChange?.(hsvToColor(pickerHue, pickerSaturation, pickerValue, pickerAlpha));
    }
    hideColorAction();
}

function onHexCancel() {
    _suppressHide = false;
    hideColorAction();
}

function onHexKeydownHandler(event) {
    if (!isPanelVisible(PanelId.COLOR)) return;
    handleHexKeydown(event, { onLiveChange: tryLiveFromHex, onCommit: onHexCommit, onCancel: onHexCancel });
}

function onHexPasteHandler(event) {
    if (!isPanelVisible(PanelId.COLOR)) return;
    const newValue = handleHexPaste(event);
    if (newValue !== undefined) tryLiveFromHex(newValue);
}

function onHexCopyHandler(event) {
    if (!isPanelVisible(PanelId.COLOR)) return;
    const cut = handleHexCopy(event);
    if (cut) tryLiveFromHex('');
}

/** Opens the color panel seeded from the current selection styles. */
export function showColorAction() {
    if (!colorActionElement) initColorAction();

    savedColorRange = captureSelectionRange();

    const styles = getStylesAtCursor();
    const currentValue = (styles?.color ?? '').toLowerCase();
    const isGradientActive = !!styles?.isGradient;

    _colorEdited = false;

    if (isGradientActive) {
        ensureCustomGradientSwatch(currentValue);
        activeSwatchOption = syncGradientSwatchActive(currentValue);
        syncSolidSwatchActive(null);
    } else {
        const parsedColor = parseColor(currentValue);
        if (parsedColor) ensureCustomSwatch(parsedColor);
        activeSwatchOption = syncSolidSwatchActive(parsedColor);
        syncGradientSwatchActive(null);
    }

    switchColorTab(isGradientActive ? 'gradient' : 'solid');

    colorActionElement.classList.add('tca-visible');
    setPanelVisible(PanelId.COLOR, true);
    _suppressHide = true;
    positionColorAction();

    pickerAlpha = isGradientActive ? 1 : extractAlpha(currentValue);
    if (_pickerAlphaInput) _pickerAlphaInput.value = Math.round(pickerAlpha * 100);

    pickerOnChange = (color) => {
        if (canApplyColor()) applySolidFull(color);
        setToolbarPreview(color);
        notifyChange();
    };
    setHexInputActive(false);

    if (isGradientActive) {
        const parsed = parseGradientStops(currentValue);
        if (parsed) {
            gradientAngle = parsed.angle;
            gradientColors = parsed.colors.map(color => parseColor(color) || color);
        }
        refreshGradientStopSwatches();
        selectGradientStop(0);
    } else {
        activeGradientStop = 0;
        seedPicker(parseColor(currentValue) || '#000000');
    }

    document.addEventListener('keydown', onHexKeydownHandler, true);
    document.addEventListener('paste', onHexPasteHandler, true);
    document.addEventListener('copy', onHexCopyHandler, true);
    document.addEventListener('cut', onHexCopyHandler, true);
    document.addEventListener('selectionchange', onSelectionChangeForColor);
    outsideDismiss.attach();
}

/**
 * Closes the color panel and resets picker state.
 * @param {boolean} [force] - Close even when hide is suppressed (e.g. eyedropper).
 */
export function hideColorAction(force = false) {
    if (!force && _suppressHide) return;
    if (!colorActionElement) return;
    _eyedropperPickAbort?.abort();
    _eyedropperPickAbort = null;
    // Swatches are added/edited explicitly via the grid now — nothing to persist on close.
    _colorEdited = false;
    _suppressHide = false;
    colorActionElement.classList.remove('tca-visible');
    setPanelVisible(PanelId.COLOR, false);
    savedColorRange = null;
    pickerOnChange = null;
    activeSwatchOption = null;
    lastColorWrapper = null;
    setHexInputActive(false);
    gradientColors = ['#FF6B6B', '#FFE66D'];
    gradientAngle = 90;
    activeGradientStop = 0;
    document.removeEventListener('keydown', onHexKeydownHandler, true);
    document.removeEventListener('paste', onHexPasteHandler, true);
    document.removeEventListener('copy', onHexCopyHandler, true);
    document.removeEventListener('cut', onHexCopyHandler, true);
    document.removeEventListener('selectionchange', onSelectionChangeForColor);
    outsideDismiss.detach();
}

/** Toggles the color panel visibility. */
export function toggleColorAction() {
    if (isPanelVisible(PanelId.COLOR)) {
        _suppressHide = false;
        hideColorAction();
    } else {
        showColorAction();
    }
}

registerPanel({ id: PanelId.COLOR, hide: hideColorAction });
