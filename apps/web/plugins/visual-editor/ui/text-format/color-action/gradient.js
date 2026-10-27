import { parseColor } from './color-conversions.js';

/**
 * @param {string} value - CSS linear-gradient value.
 * @returns {{ angle: number, colors: string[] }|null}
 */
export function parseGradientStops(value) {
    if (!value) return null;
    const match = value.match(/linear-gradient\(\s*([\s\S]+)\s*\)/);
    if (!match) return null;
    const segments = [];
    let depth = 0, current = '';
    for (const character of match[1] + ',') {
        if (character === '(') { depth++; current += character; }
        else if (character === ')') { depth--; current += character; }
        else if (character === ',' && depth === 0) { segments.push(current.trim()); current = ''; }
        else { current += character; }
    }
    if (segments.length < 2) return null;
    let angle = 90;
    let colorStart = 0;
    const first = segments[0];
    if (/^\d+(\.\d+)?deg$/.test(first)) {
        angle = parseFloat(first);
        colorStart = 1;
    } else if (/^to\s+/i.test(first)) {
        const map = { 'to right': 90, 'to left': 270, 'to top': 0, 'to bottom': 180,
            'to top right': 45, 'to top left': 315, 'to bottom right': 135, 'to bottom left': 225 };
        angle = map[first.toLowerCase()] ?? 90;
        colorStart = 1;
    }
    const colors = segments.slice(colorStart);
    if (colors.length < 2) return null;
    return { angle, colors: [colors[0], colors[1]] };
}

/**
 * @param {number} angle - Degrees.
 * @param {string} firstColor
 * @param {string} secondColor
 * @returns {string}
 */
export function buildGradient(angle, firstColor, secondColor) {
    return `linear-gradient(${angle}deg, ${firstColor}, ${secondColor})`;
}

/**
 * Normalized key for comparing gradient presets and custom swatches.
 * @param {string} value
 * @returns {string}
 */
export function canonicalGradientKey(value) {
    if (!value) return '';
    const parsed = parseGradientStops(value);
    if (!parsed) return value.replace(/\s/g, '').toLowerCase();
    const firstColor = (parseColor(parsed.colors[0]) || parsed.colors[0]).toLowerCase();
    const secondColor = (parseColor(parsed.colors[1]) || parsed.colors[1]).toLowerCase();
    return `${parsed.angle}|${firstColor}|${secondColor}`;
}
