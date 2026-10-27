/** DOM id for the text color/gradient action panel root element. */
export const COLOR_ACTION_ID = 'text-format-color-action';

/** Preset solid fill colors for the swatch grid. */
export const SOLID_COLORS = [
    '#000000',
    '#FF3B30',
    '#FF9500',
    '#34C759',
    '#007AFF',
];

/** Preset CSS linear gradients for the swatch grid. */
export const GRADIENTS = [
    'linear-gradient(90deg, #FF6B6B, #FFE66D)',
    'linear-gradient(90deg, #4A90E2, #50C9C3)',
    'linear-gradient(90deg, #F12711, #F5AF19)',
    'linear-gradient(90deg, #8E2DE2, #4A00E0)',
    'linear-gradient(90deg, #00B09B, #96C93D)',
];

/** HTML scaffold for the color action panel (tabs, swatches, picker). */
export const COLOR_ACTION_HTML = `
<div id="${COLOR_ACTION_ID}">
    <div class="tft-color-tabs">
        <button class="tft-color-tab tca-tab-active" data-tab="solid">Solid</button>
        <button class="tft-color-tab" data-tab="gradient">Gradient</button>
    </div>
    <div class="tft-color-grid" data-tab-panel="solid">
        ${SOLID_COLORS.map(color => `<div class="tft-color-option" data-color="${color}"><span class="tft-color-swatch" style="background:${color}"></span></div>`).join('\n        ')}
        <div class="tft-color-add" role="button" aria-label="Add color" title="Add color"><span class="tft-color-add-box"></span></div>
    </div>
    <div class="tft-color-grid tca-hidden" data-tab-panel="gradient">
        ${GRADIENTS.map(gradient => `<div class="tft-color-option" data-gradient="${gradient}"><span class="tft-color-swatch" style="background:${gradient}"></span></div>`).join('\n        ')}
        <div class="tft-color-add" role="button" aria-label="Add gradient" title="Add gradient"><span class="tft-color-add-box"></span></div>
    </div>
    <div class="tft-gradient-stops tca-hidden" data-tab-panel="gradient">
        <div class="tft-color-option tft-gradient-stop-swatch" data-stop="0"><span class="tft-color-swatch"></span></div>
        <div class="tft-color-option tft-gradient-stop-swatch" data-stop="1"><span class="tft-color-swatch"></span></div>
    </div>
    <div class="tft-picker">
        <div class="tft-picker-square">
            <div class="tft-picker-sq-white"></div>
            <div class="tft-picker-sq-black"></div>
            <div class="tft-picker-indicator"></div>
        </div>
        <input type="range" class="tft-picker-hue" min="0" max="360" value="0">
        <input type="range" class="tft-picker-alpha" min="0" max="100" value="100">
        <div class="tft-picker-hex-row">
            <div class="tft-picker-hex-input" role="textbox"></div>
            <button class="tft-picker-hex-picker">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8.22768 7.04306L4.90249 10.3683C4.84755 10.4232 4.8201 10.5012 4.83022 10.5782L4.90249 11.1212L5.39174 11.1661L5.44643 11.1651C5.50056 11.1581 5.55163 11.1331 5.59096 11.0938L8.93471 7.75009L9.99624 8.81064L6.65151 12.1544C6.33072 12.4751 5.89991 12.6576 5.45132 12.6671L5.25796 12.6602L4.52065 12.5938L4.27553 12.839C3.98275 13.1317 3.50791 13.1315 3.21499 12.839C2.94053 12.5645 2.92334 12.1306 3.16323 11.836L3.21499 11.7784L3.44643 11.547L3.34389 10.7735C3.273 10.2342 3.45731 9.69234 3.84194 9.30771L7.16714 5.98251L8.22768 7.04306Z" fill="#ffffff"/>
                    <path d="M10.3869 2.83798C11.1679 2.05694 12.4349 2.05694 13.216 2.83798C13.9966 3.61894 13.9966 4.88512 13.216 5.66611L11.6242 7.25693L11.9777 7.61044C12.2706 7.90334 12.2706 8.37907 11.9777 8.67197C11.6848 8.96443 11.2099 8.96461 10.9171 8.67197L7.38198 5.13584C7.08909 4.84294 7.08909 4.36818 7.38198 4.07529C7.67488 3.78249 8.14967 3.78243 8.44253 4.07529L8.79604 4.4288L10.3869 2.83798Z" fill="#ffffff"/>
                </svg>
            </button>
        </div>
    </div>
</div>
`.trim();