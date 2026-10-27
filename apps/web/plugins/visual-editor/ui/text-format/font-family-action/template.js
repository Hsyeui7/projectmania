/** DOM id for the font family action panel root element. */
export const FONT_ACTION_ID = 'text-format-font-action';

/** System font presets shown in the font family dropdown. */
export const SYSTEM_FONTS = [
    { name: 'Arial',           stack: 'Arial, sans-serif' },
    { name: 'Helvetica',       stack: 'Helvetica, sans-serif' },
    { name: 'Verdana',         stack: 'Verdana, sans-serif' },
    { name: 'Trebuchet MS',    stack: '"Trebuchet MS", sans-serif' },
    { name: 'Georgia',         stack: 'Georgia, serif' },
    { name: 'Times New Roman', stack: '"Times New Roman", serif' },
    { name: 'Courier New',     stack: '"Courier New", monospace' },
];

/** HTML scaffold for the font family action panel. */
export const FONT_ACTION_HTML = `<div id="${FONT_ACTION_ID}"></div>`;