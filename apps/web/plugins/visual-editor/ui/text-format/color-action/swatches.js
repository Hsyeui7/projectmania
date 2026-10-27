import { SOLID_COLORS, GRADIENTS } from './template.js';
import { canonicalGradientKey } from './gradient.js';

/** Maximum total swatches shown in a grid (presets + custom): 3 rows of 7. */
export const COLOR_GRID_MAX = 21;

/** Maximum custom solid/gradient swatches persisted in localStorage. */
export const CUSTOM_SWATCHES_MAX = 32;

/** localStorage key for user-added solid color swatches. */
const CUSTOM_SOLIDS_KEY = 'tft-color-custom-solids';

/** localStorage key for user-added gradient swatches. */
const CUSTOM_GRADIENTS_KEY = 'tft-color-custom-gradients';

/** Lowercase preset solid colors used to skip duplicate custom entries. */
const PRESET_SOLIDS_LOWERCASE = SOLID_COLORS.map(color => color.toLowerCase());

/** Canonical keys for preset gradients used to skip duplicate custom entries. */
const PRESET_GRADIENT_KEYS = GRADIENTS.map(gradient => canonicalGradientKey(gradient));

let _element = null;

/** @param {HTMLElement} colorActionElement */
export function initSwatches(colorActionElement) {
    _element = colorActionElement;
}

/**
 * @param {HTMLElement} grid
 * @returns {boolean} Whether the grid is already at the 21-swatch cap.
 */
function isGridFull(grid) {
    return grid.querySelectorAll('.tft-color-option').length >= COLOR_GRID_MAX;
}

/** @param {HTMLElement} option @returns {boolean} */
export function isCustomSwatchEl(option) {
    return !!option && option.classList?.contains('tft-custom');
}

/** Highlights `option` as the active swatch within its grid (and clears siblings). */
export function setActiveSwatch(option) {
    const grid = option?.parentElement;
    if (!grid) return;
    grid.querySelectorAll('.tft-color-option').forEach(swatchOption => swatchOption.classList.toggle('tca-active', swatchOption === option));
}

/** Shows/hides the grid's "+" add button based on the 21-swatch cap. */
export function updateAddButtonVisibility(grid) {
    const addButton = grid?.querySelector('.tft-color-add');
    if (!addButton) return;
    addButton.style.display = isGridFull(grid) ? 'none' : '';
}

/** Inserts a swatch before the trailing "+" add button (or appends it). */
function appendSwatch(grid, element) {
    const addButton = grid.querySelector('.tft-color-add');
    if (addButton) grid.insertBefore(element, addButton);
    else grid.appendChild(element);
    updateAddButtonVisibility(grid);
}

/**
 * @param {string} key - localStorage key.
 * @returns {string[]}
 */
export function loadCustomList(key) {
    try {
        const raw = localStorage.getItem(key);
        const array = raw ? JSON.parse(raw) : [];
        return Array.isArray(array) ? array.filter(value => typeof value === 'string') : [];
    } catch { return []; }
}

/**
 * @param {string} key
 * @param {string[]} array
 */
export function saveCustomList(key, array) {
    try { localStorage.setItem(key, JSON.stringify(array.slice(-CUSTOM_SWATCHES_MAX))); } catch { /* quota / disabled */ }
}

/** Rewrites the persisted custom solids list from the swatches currently in the grid. */
function persistSolidsFromDom(grid) {
    const customs = Array.from(grid.querySelectorAll('.tft-color-option.tft-custom'))
        .map(option => (option.dataset.color || '').toLowerCase())
        .filter(Boolean);
    saveCustomList(CUSTOM_SOLIDS_KEY, customs);
}

/** Rewrites the persisted custom gradients list from the swatches currently in the grid. */
function persistGradientsFromDom(grid) {
    const customs = Array.from(grid.querySelectorAll('.tft-color-option.tft-custom'))
        .map(option => (option.dataset.gradient || '').toLowerCase())
        .filter(Boolean);
    saveCustomList(CUSTOM_GRADIENTS_KEY, customs);
}

/**
 * Highlights the solid swatch matching the given hex.
 * @param {string|null} hex
 * @returns {HTMLElement|null} Matched option element.
 */
export function syncSolidSwatchActive(hex) {
    if (!_element) return null;
    const target = hex?.toLowerCase();
    let found = null;
    _element.querySelectorAll('.tft-color-grid[data-tab-panel="solid"] .tft-color-option').forEach(option => {
        const match = !!target && (option.dataset.color || '').toLowerCase() === target;
        option.classList.toggle('tca-active', match);
        if (match) found = option;
    });
    return found;
}

/**
 * Highlights the gradient swatch matching the given CSS gradient.
 * @param {string|null} gradient
 * @returns {HTMLElement|null} Matched option element.
 */
export function syncGradientSwatchActive(gradient) {
    if (!_element) return null;
    const targetKey = gradient ? canonicalGradientKey(gradient) : '';
    let found = null;
    _element.querySelectorAll('.tft-color-grid[data-tab-panel="gradient"] .tft-color-option').forEach(option => {
        const optionKey = canonicalGradientKey(option.dataset.gradient || '');
        const match = !!targetKey && optionKey === targetKey;
        option.classList.toggle('tca-active', match);
        if (match) found = option;
    });
    return found;
}

/** Recolors a swatch in place (presets too); re-persists when it's a custom one. */
export function recolorSolidSwatch(option, hex) {
    if (!option || !hex) return;
    hex = hex.toLowerCase();
    option.dataset.color = hex;
    const innerSwatch = option.querySelector('.tft-color-swatch');
    if (innerSwatch) innerSwatch.style.background = hex;
    if (isCustomSwatchEl(option)) persistSolidsFromDom(option.parentElement);
}

/** Recolors a gradient swatch in place (presets too); re-persists when custom. */
export function recolorGradientSwatch(option, gradient) {
    if (!option || !gradient) return;
    const normalizedGradient = gradient.toLowerCase();
    option.dataset.gradient = normalizedGradient;
    const innerSwatch = option.querySelector('.tft-color-swatch');
    if (innerSwatch) innerSwatch.style.background = normalizedGradient;
    if (isCustomSwatchEl(option)) persistGradientsFromDom(option.parentElement);
}

/**
 * Returns the existing solid swatch matching `hex`, or appends a new custom one
 * (up to the 21-swatch cap). Returns null only when the grid is full.
 * @param {string} hex
 * @returns {HTMLElement|null}
 */
export function ensureCustomSwatch(hex) {
    if (!_element || !hex) return null;
    hex = hex.toLowerCase();
    const grid = _element.querySelector('.tft-color-grid[data-tab-panel="solid"]');
    if (!grid) return null;
    const existing = Array.from(grid.querySelectorAll('.tft-color-option'))
        .find(candidateOption => (candidateOption.dataset.color || '').toLowerCase() === hex);
    if (existing) return existing;
    if (isGridFull(grid)) return null;
    const option = document.createElement('div');
    option.className = 'tft-color-option tft-custom';
    option.dataset.color = hex;
    option.innerHTML = `<span class="tft-color-swatch" style="background:${hex}"></span>`;
    appendSwatch(grid, option);
    persistSolidsFromDom(grid);
    return option;
}

/**
 * Returns the existing gradient swatch matching `gradient`, or appends a new
 * custom one (up to the cap). Returns null only when the grid is full.
 * @param {string} gradient
 * @returns {HTMLElement|null}
 */
export function ensureCustomGradientSwatch(gradient) {
    if (!_element || !gradient) return null;
    const normalizedGradient = gradient.toLowerCase();
    const key = canonicalGradientKey(normalizedGradient);
    const grid = _element.querySelector('.tft-color-grid[data-tab-panel="gradient"]');
    if (!grid) return null;
    const existing = Array.from(grid.querySelectorAll('.tft-color-option'))
        .find(candidateOption => canonicalGradientKey(candidateOption.dataset.gradient || '') === key);
    if (existing) return existing;
    if (isGridFull(grid)) return null;
    const option = document.createElement('div');
    option.className = 'tft-color-option tft-custom';
    option.dataset.gradient = normalizedGradient;
    option.innerHTML = `<span class="tft-color-swatch" style="background:${normalizedGradient}"></span>`;
    appendSwatch(grid, option);
    persistGradientsFromDom(grid);
    return option;
}

/**
 * Appends a new custom solid swatch even when the color already exists — used by
 * the "+" button to duplicate the active swatch. Returns null when the grid is full.
 * @param {string} hex
 * @returns {HTMLElement|null}
 */
export function appendCustomSwatch(hex) {
    if (!_element || !hex) return null;
    hex = hex.toLowerCase();
    const grid = _element.querySelector('.tft-color-grid[data-tab-panel="solid"]');
    if (!grid || isGridFull(grid)) return null;
    const option = document.createElement('div');
    option.className = 'tft-color-option tft-custom';
    option.dataset.color = hex;
    option.innerHTML = `<span class="tft-color-swatch" style="background:${hex}"></span>`;
    appendSwatch(grid, option);
    persistSolidsFromDom(grid);
    return option;
}

/**
 * Appends a new custom gradient swatch even when it already exists — used by the
 * "+" button to duplicate the active gradient. Returns null when the grid is full.
 * @param {string} gradient
 * @returns {HTMLElement|null}
 */
export function appendCustomGradientSwatch(gradient) {
    if (!_element || !gradient) return null;
    const normalizedGradient = gradient.toLowerCase();
    const grid = _element.querySelector('.tft-color-grid[data-tab-panel="gradient"]');
    if (!grid || isGridFull(grid)) return null;
    const option = document.createElement('div');
    option.className = 'tft-color-option tft-custom';
    option.dataset.gradient = normalizedGradient;
    option.innerHTML = `<span class="tft-color-swatch" style="background:${normalizedGradient}"></span>`;
    appendSwatch(grid, option);
    persistGradientsFromDom(grid);
    return option;
}

/** Rebuilds custom solid and gradient swatches from localStorage. */
export function restorePersistedSwatches() {
    if (!_element) return;

    const solidGrid = _element.querySelector('.tft-color-grid[data-tab-panel="solid"]');
    if (solidGrid) {
        const stored = loadCustomList(CUSTOM_SOLIDS_KEY);
        const cleaned = [];
        const seen = new Set();
        stored.forEach(hex => {
            const lowercaseHex = (hex || '').toLowerCase();
            if (!lowercaseHex || PRESET_SOLIDS_LOWERCASE.includes(lowercaseHex) || seen.has(lowercaseHex)) return;
            seen.add(lowercaseHex);
            cleaned.push(lowercaseHex);
            const exists = Array.from(solidGrid.querySelectorAll('.tft-color-option'))
                .some(option => (option.dataset.color || '').toLowerCase() === lowercaseHex);
            if (exists || isGridFull(solidGrid)) return;
            const div = document.createElement('div');
            div.className = 'tft-color-option tft-custom';
            div.dataset.color = lowercaseHex;
            div.innerHTML = `<span class="tft-color-swatch" style="background:${lowercaseHex}"></span>`;
            appendSwatch(solidGrid, div);
        });
        if (cleaned.length !== stored.length) saveCustomList(CUSTOM_SOLIDS_KEY, cleaned);
        updateAddButtonVisibility(solidGrid);
    }

    const gradientGrid = _element.querySelector('.tft-color-grid[data-tab-panel="gradient"]');
    if (gradientGrid) {
        const stored = loadCustomList(CUSTOM_GRADIENTS_KEY);
        const cleaned = [];
        const seen = new Set();
        stored.forEach(gradient => {
            const lowercaseGradient = (gradient || '').toLowerCase();
            if (!lowercaseGradient) return;
            const key = canonicalGradientKey(lowercaseGradient);
            if (PRESET_GRADIENT_KEYS.includes(key) || seen.has(key)) return;
            seen.add(key);
            cleaned.push(lowercaseGradient);
            const exists = Array.from(gradientGrid.querySelectorAll('.tft-color-option'))
                .some(option => canonicalGradientKey(option.dataset.gradient || '') === key);
            if (exists || isGridFull(gradientGrid)) return;
            const div = document.createElement('div');
            div.className = 'tft-color-option tft-custom';
            div.dataset.gradient = lowercaseGradient;
            div.innerHTML = `<span class="tft-color-swatch" style="background:${lowercaseGradient}"></span>`;
            appendSwatch(gradientGrid, div);
        });
        if (cleaned.length !== stored.length) saveCustomList(CUSTOM_GRADIENTS_KEY, cleaned);
        updateAddButtonVisibility(gradientGrid);
    }
}
