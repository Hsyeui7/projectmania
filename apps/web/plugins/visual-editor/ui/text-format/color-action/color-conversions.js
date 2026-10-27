/**
 * @param {number} hue - Hue 0–360.
 * @param {number} saturation - Saturation 0–1.
 * @param {number} value - Value 0–1.
 * @returns {string}
 */
export function hsvToHex(hue, saturation, value) {
    const f = (n, k = (n + hue / 60) % 6) => value - value * saturation * Math.max(Math.min(k, 4 - k, 1), 0);
    const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(5))}${toHex(f(3))}${toHex(f(1))}`;
}

/**
 * @param {number} hue
 * @param {number} saturation
 * @param {number} value
 * @param {number} [alpha] - Alpha 0–1.
 * @returns {string}
 */
export function hsvToColor(hue, saturation, value, alpha = 1) {
    const hex = hsvToHex(hue, saturation, value);
    if (alpha >= 1) return hex;
    const red = parseInt(hex.slice(1, 3), 16);
    const green = parseInt(hex.slice(3, 5), 16);
    const blue = parseInt(hex.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${parseFloat(alpha.toFixed(3))})`;
}

/**
 * @param {string} hex
 * @returns {{ h: number, s: number, v: number }|null}
 */
export function hexToHsv(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(character => character + character).join('');
    if (hex.length !== 6) return null;
    const red = parseInt(hex.slice(0, 2), 16) / 255;
    const green = parseInt(hex.slice(2, 4), 16) / 255;
    const blue = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
    const value = max, delta = max - min;
    const saturation = max === 0 ? 0 : delta / max;
    let hue = 0;
    if (delta !== 0) {
        switch (max) {
            case red: hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6; break;
            case green: hue = ((blue - red) / delta + 2) / 6; break;
            default: hue = ((red - green) / delta + 4) / 6; break;
        }
    }
    return { h: hue * 360, s: saturation, v: value };
}

/**
 * @param {string} value
 * @returns {string|null} Normalized #rrggbb or null.
 */
export function parseHexInput(value) {
    value = value.trim().replace(/^#/, '');
    if (value.length === 3) value = value.split('').map(character => character + character).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    return `#${value.toLowerCase()}`;
}

/**
 * @param {string} value - Any CSS color string.
 * @returns {string|null}
 */
export function cssColorToHex(value) {
    const cleaned = value.replace(/\s+[\d.]+(%|px|em|rem)\s*$/, '').trim();
    try {
        const context = document.createElement('canvas').getContext('2d');
        context.fillStyle = '#010203';
        context.fillStyle = cleaned;
        const result = context.fillStyle;
        if (result === '#010203' && cleaned !== '#010203') return null;
        return parseHexInput(result);
    } catch { return null; }
}

/**
 * @param {string} value
 * @returns {string|null} Hex color when parseable.
 */
export function parseColor(value) {
    if (!value) return null;
    const hex = parseHexInput(value);
    if (hex) return hex;
    const rgbMatch = value.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbMatch) return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]].map(component => Number(component).toString(16).padStart(2, '0')).join('')}`;
    const rgbaMatch = value.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
    if (rgbaMatch) return `#${[rgbaMatch[1], rgbaMatch[2], rgbaMatch[3]].map(component => Number(component).toString(16).padStart(2, '00')).join('')}`;
    return cssColorToHex(value);
}

/**
 * @param {string} value
 * @returns {number} Alpha 0–1.
 */
export function extractAlpha(value) {
    if (!value) return 1;
    const match = value.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
    return match ? Math.min(1, Math.max(0, parseFloat(match[1]))) : 1;
}
