import { TOOLBAR_ID } from './template.js';
import { PANEL_BG, BORDER_COLOR, BORDER_COLOR_TRANSLUCENT, HOVER_BG, ACTIVE_BG, BOX_SHADOW_TOOLBAR, COLOR_WHITE } from '../../../constants/theme.js';

/** Injected CSS for the floating text-format toolbar. */
export const TOOLBAR_STYLES = `
#${TOOLBAR_ID} {
  position: fixed;
  display: none;
  align-items: center;
  padding: 4px;
  background: ${PANEL_BG};
  border: 1px solid ${BORDER_COLOR};
  border-radius: 12px;
  box-shadow: ${BOX_SHADOW_TOOLBAR};
  user-select: none;
  color: ${COLOR_WHITE};
  font-family: DM Sans, sans-serif;
  white-space: nowrap;
  cursor: grab;
  /* Never exceed the viewport — the inner row scrolls horizontally instead. */
  max-width: calc(100vw - 16px);
}
#${TOOLBAR_ID}.tft-visible { display: flex; }
#${TOOLBAR_ID}.tft-dragging { cursor: grabbing; }

/* Horizontally scrollable control row. The more-panel is a sibling (not inside
   this container) so it is never clipped by the scroll overflow. */
.tft-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
}
.tft-scroll::-webkit-scrollbar { display: none; }

.tft-text-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: ${COLOR_WHITE};
  font-family: DM Sans, sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  cursor: pointer;
  flex-shrink: 0;
}
.tft-text-btn:hover { background: ${HOVER_BG}; }
.tft-text-btn svg { flex-shrink: 0; }

.tft-swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
}
.tft-swatch:hover { background: ${HOVER_BG}; }

.tft-swatch-preview {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: ${COLOR_WHITE};
  border: 1px solid ${BORDER_COLOR_TRANSLUCENT};
  pointer-events: none;
}

.tft-divider {
  width: 1px;
  height: 24px;
  background: ${COLOR_WHITE}26;
  flex-shrink: 0;
}

.tft-select {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: ${COLOR_WHITE};
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  min-width: 32px;
  max-width: 120px;
  cursor: pointer;
  white-space: nowrap;
}
.tft-select:hover { background: ${HOVER_BG}; }
.tft-select--size { width: 64px; }

/* Fills the button so long font names ellipsis-truncate instead of widening it. */
.tft-label {
  flex: 1 0 0;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tft-font-size {
  color: ${COLOR_WHITE};
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  font-family: DM Sans, sans-serif;
  cursor: text;
}
.tft-font-size--editing::after {
  content: '';
  display: inline-block;
  width: 1px;
  height: 0.9em;
  background: ${COLOR_WHITE};
  margin-left: 1px;
  vertical-align: text-bottom;
  animation: tft-cursor-blink 1s step-end infinite;
}

@keyframes tft-cursor-blink {
  50% { opacity: 0; }
}

.tft-btn-group {
  display: flex;
  gap: 2px;
}

.tft-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #9ca3af;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.tft-btn:hover {
  background: ${ACTIVE_BG};
  color: ${COLOR_WHITE};
}

.tft-btn.tft-active {
  background: ${ACTIVE_BG};
  color: ${COLOR_WHITE};
}

.tft-btn--italic {
  font-style: italic;
  font-weight: 400;
  font-size: 15px;
}

.tft-btn--more { display: none; }

@media (pointer: coarse) {
  .tft-btn-group .tft-btn[data-action="bold"],
  .tft-btn-group .tft-btn[data-action="italic"],
  .tft-btn-group .tft-btn[data-action="underline"],
  .tft-btn-group .tft-btn[data-action="align"] { display: none; }
  .tft-btn--more { display: flex; }
}

.tft-more-panel {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: ${PANEL_BG};
  border: 1px solid ${BORDER_COLOR};
  border-radius: 12px;
  box-shadow: ${BOX_SHADOW_TOOLBAR};
}

.tft-more-panel.tft-open { 
  display: flex; 
}
`;
