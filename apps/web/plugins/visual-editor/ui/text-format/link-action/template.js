/** DOM id for the link action panel root element. */
export const LINK_ACTION_ID = 'text-format-link-action';

/** HTML scaffold for the link panel (URL input and new-tab checkbox). */
export const LINK_ACTION_HTML = `
<div id="${LINK_ACTION_ID}">
    <div id="tft-link-url" class="tft-link-input" role="textbox" aria-label="URL"></div>
    <label class="tft-link-newwindow">
        <input class="tft-link-checkbox" type="checkbox" id="tft-link-new-window" />
        <span class="tft-link-newwindow-label">New tab</span>
    </label>
</div>
`.trim();
