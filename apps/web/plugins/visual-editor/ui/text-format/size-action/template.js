/** DOM id for the font size action panel root element. */
export const SIZE_ACTION_ID = 'text-format-size-action';

/** Preset font sizes (px) listed in the size dropdown. */
export const TEXT_SIZES = [6, 8, 10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 48, 56, 64, 72, 80, 88, 96, 104, 120, 144];

/** HTML scaffold for the font size dropdown options. */
export const SIZE_ACTION_HTML = `
<div id="${SIZE_ACTION_ID}">
    ${TEXT_SIZES.map(size => `<div class="tft-size-option" data-size="${size}">${size}</div>`).join('')}
</div>
`.trim();
