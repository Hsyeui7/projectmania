import { LINK_ACTION_ID } from './template.js';
import { PANEL_BG, BORDER_COLOR, BORDER_COLOR_FOCUS, BOX_SHADOW_DROPDOWN, COLOR_WHITE, PLACEHOLDER_COLOR } from '../../../constants/theme.js';

/** Injected CSS for the link insertion panel. */
export const LINK_ACTION_STYLES = `
#${LINK_ACTION_ID} {
  position: fixed;
  display: none;
  flex-direction: column;
  gap: 8px;
  background: ${PANEL_BG};
  padding: 8px;
  border-radius: 12px;
  box-sizing: border-box;
  box-shadow: ${BOX_SHADOW_DROPDOWN};
  user-select: none;
  font-family: DM Sans, sans-serif;
}

#${LINK_ACTION_ID}.tla-visible {
  display: flex;
}

.tft-link-input {
  background: transparent;
  border: 1px solid ${BORDER_COLOR};
  border-radius: 8px;
  color: ${COLOR_WHITE};
  font-family: DM Sans, sans-serif;
  font-size: 12px;
  line-height: 20px;
  padding: 6px 8px;
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  cursor: text;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.tft-link-input.tla-focused {
  border-color: ${BORDER_COLOR_FOCUS};
}

.tft-link-placeholder {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 8px;
  color: ${PLACEHOLDER_COLOR};
  pointer-events: none;
}

.tft-link-char {
  white-space: pre;
}

.tft-link-csel {
  background: #357DF966;
  border-radius: 1px;
}

.tft-link-vcursor {
  display: inline-block;
  width: 1px;
  height: 1em;
  background: ${COLOR_WHITE};
  margin-right: -1px;
  vertical-align: text-bottom;
  animation: tft-cursor-blink 1s step-end infinite;
}

@keyframes tft-cursor-blink {
  50% { opacity: 0; }
}

.tft-link-newwindow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  cursor: pointer;
}
.tft-link-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border: 1.5px solid ${COLOR_WHITE}4d;
  border-radius: 3px;
  background: ${COLOR_WHITE}08;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
}
.tft-link-checkbox:checked {
  background: ${COLOR_WHITE};
  border-color: ${COLOR_WHITE};
}
.tft-link-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 2px;
  width: 4px;
  height: 7px;
  border: 2px solid ${PANEL_BG};
  border-top: none;
  border-left: none;
  transform: rotate(45deg);
}
.tft-link-newwindow-label {
  font-size: 12px;
  color: ${COLOR_WHITE};
}
`;
