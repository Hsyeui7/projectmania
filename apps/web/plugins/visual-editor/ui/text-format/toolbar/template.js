import { ICON_CHEVRON_DOWN, ICON_BOLD, ICON_ITALIC, ICON_UNDERLINE, ICON_ALIGN_LEFT, ICON_MORE, ICON_LINK, ICON_SPARKLES } from "../../../constants/icons.js";

/** DOM id for the floating text-format toolbar root element. */
export const TOOLBAR_ID = 'text-format-toolbar';

/** HTML scaffold for the inline text-format toolbar buttons. */
export const TOOLBAR_HTML = `
<div id="${TOOLBAR_ID}">
  <div class="tft-scroll">
    <button class="tft-text-btn" data-action="edit-with-ai" title="Edit with AI">
      ${ICON_SPARKLES}
      <span class="tft-text-btn-label">Edit with AI</span>
    </button>
    <span class="tft-divider"></span>
    <button class="tft-swatch" data-action="color" title="Text color">
      <span class="tft-swatch-preview"></span>
    </button>
    <span class="tft-divider"></span>
    <button class="tft-select" data-action="font-family" title="Font family">
      <span class="tft-label tft-font-family">Inter</span>
      ${ICON_CHEVRON_DOWN}
    </button>
    <span class="tft-divider"></span>
    <button class="tft-select tft-select--size" data-action="font-size" title="Font size">
      <span class="tft-label tft-font-size">16</span>
      ${ICON_CHEVRON_DOWN}
    </button>
    <span class="tft-divider"></span>
    <div class="tft-btn-group" role="group" aria-label="Text formatting options">
      <button class="tft-btn" data-action="bold" title="Bold">${ICON_BOLD}</button>
      <button class="tft-btn tft-btn--italic" data-action="italic" title="Italic">${ICON_ITALIC}</button>
      <button class="tft-btn" data-action="underline" title="Underline">${ICON_UNDERLINE}</button>
      <button class="tft-btn" data-action="align" title="Text alignment">${ICON_ALIGN_LEFT}</button>
      <button class="tft-btn tft-btn--more" data-action="more" title="More formatting">${ICON_MORE}</button>
      <button class="tft-btn" data-action="link" title="Link">${ICON_LINK}</button>
    </div>
  </div>
  <div class="tft-more-panel">
    <button class="tft-btn" data-action="bold" title="Bold">${ICON_BOLD}</button>
    <button class="tft-btn tft-btn--italic" data-action="italic" title="Italic">${ICON_ITALIC}</button>
    <button class="tft-btn" data-action="underline" title="Underline">${ICON_UNDERLINE}</button>
    <button class="tft-btn" data-action="align" title="Text alignment">${ICON_ALIGN_LEFT}</button>
  </div>
</div>
`.trim();

/** SVG icons for left, center, and right text alignment toolbar states. */
export const ALIGN_ICONS = {
    left: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10.5771 11.2539C10.9551 11.2925 11.25 11.6118 11.25 12C11.25 12.3882 10.9551 12.7075 10.5771 12.7461L10.5 12.75H3.5C3.08579 12.75 2.75 12.4142 2.75 12C2.75 11.5858 3.08579 11.25 3.5 11.25H10.5L10.5771 11.2539Z" fill="white"/><path d="M7.5 7.25C7.91421 7.25 8.25 7.58579 8.25 8C8.25 8.41421 7.91421 8.75 7.5 8.75H3.5C3.08579 8.75 2.75 8.41421 2.75 8C2.75 7.58579 3.08579 7.25 3.5 7.25H7.5Z" fill="white"/><path d="M13.5 3.25C13.9142 3.25007 14.25 3.58583 14.25 4C14.25 4.41417 13.9142 4.74993 13.5 4.75H3.5C3.08579 4.75 2.75 4.41421 2.75 4C2.75 3.58579 3.08579 3.25 3.5 3.25H13.5Z" fill="white"/></svg>`,
    center: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.5771 11.2539C11.9551 11.2925 12.25 11.6118 12.25 12C12.25 12.3882 11.9551 12.7075 11.5771 12.7461L11.5 12.75H4.5C4.08579 12.75 3.75 12.4142 3.75 12C3.75 11.5858 4.08579 11.25 4.5 11.25H11.5L11.5771 11.2539Z" fill="white"/><path d="M10.0771 7.25391C10.4551 7.29253 10.75 7.61183 10.75 8C10.75 8.38817 10.4551 8.70747 10.0771 8.74609L10 8.75H6C5.58579 8.75 5.25 8.41421 5.25 8C5.25 7.58579 5.58579 7.25 6 7.25H10L10.0771 7.25391Z" fill="white"/><path d="M13 3.25C13.4142 3.25 13.75 3.58579 13.75 4C13.75 4.41421 13.4142 4.75 13 4.75H3C2.58579 4.75 2.25 4.41421 2.25 4C2.25 3.58579 2.58579 3.25 3 3.25H13Z" fill="white"/></svg>`,
    right: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12.5 11.25C12.9142 11.25 13.25 11.5858 13.25 12C13.25 12.4142 12.9142 12.75 12.5 12.75H5.5L5.42285 12.7461C5.04488 12.7075 4.75 12.3882 4.75 12C4.75 11.6118 5.04488 11.2925 5.42285 11.2539L5.5 11.25H12.5Z" fill="white"/><path d="M12.5 7.25C12.9142 7.25 13.25 7.58579 13.25 8C13.25 8.41421 12.9142 8.75 12.5 8.75H8.5C8.08579 8.75 7.75 8.41421 7.75 8C7.75 7.58579 8.08579 7.25 8.5 7.25H12.5Z" fill="white"/><path d="M12.5 3.25C12.9142 3.25 13.25 3.58579 13.25 4C13.25 4.41421 12.9142 4.75 12.5 4.75H2.5C2.08579 4.75 1.75 4.41421 1.75 4C1.75 3.58579 2.08579 3.25 2.5 3.25H12.5Z" fill="white"/></svg>`,
};
