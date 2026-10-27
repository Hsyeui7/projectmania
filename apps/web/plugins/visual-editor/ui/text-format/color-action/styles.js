import { COLOR_ACTION_ID } from './template.js';
import { PANEL_BG, BORDER_COLOR, BORDER_COLOR_FOCUS, HOVER_BG, BOX_SHADOW_DROPDOWN, COLOR_WHITE } from '../../../constants/theme.js';

/** Injected CSS for the text color and gradient action panel. */
export const COLOR_ACTION_STYLES = `
#${COLOR_ACTION_ID} {
  position: fixed;
  display: none;
  flex-direction: column;
  width: 216px;
  background: ${PANEL_BG};
  border: 1px solid ${BORDER_COLOR};
  border-radius: 20px;
  padding: 12px;
  box-shadow: ${BOX_SHADOW_DROPDOWN};
  font-family: DM Sans, sans-serif;
  user-select: none;
}

#${COLOR_ACTION_ID}.tca-visible {
  display: flex;
}

.tft-color-tabs {
  display: flex;
  gap: 1px;
  padding: 1px;
  border: 1px solid ${BORDER_COLOR};
  border-radius: 8px;
}

.tft-color-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: ${COLOR_WHITE};
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  line-height: 20px;
}

.tft-color-tab:hover {
  background: ${HOVER_BG};
}

.tft-color-tab.tca-tab-active {
  background: ${BORDER_COLOR};
}

.tft-color-grid {
  display: flex;
  flex-wrap: wrap;
  margin: 10px 0px;
}

.tft-color-grid.tca-hidden {
  display: none;
}

.tft-color-option {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  padding: 2px;
}

.tft-color-swatch {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 1px solid #262831;
  pointer-events: none;
  transition: border-color 0.15s;
}

/* Indicate hover/active by recoloring the swatch's own border (no extra ring). */
.tft-color-option:hover .tft-color-swatch,
.tft-color-option.tca-active .tft-color-swatch {
  border-color: ${COLOR_WHITE};
}

.tft-color-add {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  padding: 2px;
  cursor: pointer;
}

.tft-color-add-box {
  box-sizing: border-box;
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: 1px solid ${COLOR_WHITE}4d;
  transition: border-color 0.15s;
}

/* Plus drawn with two bars so it is always geometrically centered. */
.tft-color-add-box::before,
.tft-color-add-box::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: ${COLOR_WHITE}99;
  transition: background 0.15s;
}

.tft-color-add-box::before { width: 9px; height: 1px; }
.tft-color-add-box::after { width: 1px; height: 9px; }

.tft-color-add:hover .tft-color-add-box {
  border-color: ${COLOR_WHITE};
}

.tft-color-add:hover .tft-color-add-box::before,
.tft-color-add:hover .tft-color-add-box::after {
  background: ${COLOR_WHITE};
}

.tft-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tft-picker-square {
  position: relative;
  width: 100%;
  height: 116px;
  border-radius: 6px;
  overflow: hidden;
  cursor: crosshair;
}

.tft-picker-sq-white {
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, ${COLOR_WHITE}, transparent);
  pointer-events: none;
}

.tft-picker-sq-black {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, #000, transparent);
  pointer-events: none;
}

.tft-picker-indicator {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid ${COLOR_WHITE};
  box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.tft-picker-hue,
.tft-picker-alpha {
  width: 100%;
  height: 10px;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 5px;
  outline: none;
  cursor: pointer;
  border: none;
}

.tft-picker-hue {
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}

.tft-picker-hue::-webkit-slider-thumb,
.tft-picker-alpha::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: ${COLOR_WHITE};
  border: 1.5px solid rgba(255,255,255,0.4);
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  cursor: pointer;
}

.tft-picker-hue::-moz-range-thumb,
.tft-picker-alpha::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: ${COLOR_WHITE};
  border: 1.5px solid rgba(255,255,255,0.4);
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  cursor: pointer;
}

.tft-picker-hex-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tft-picker-hex-input {
  flex: 1;
  background: transparent;
  border: 1px solid ${BORDER_COLOR};
  border-radius: 8px;
  color: ${COLOR_WHITE};
  font-family: inherit;
  font-size: 12px;
  line-height: 20px;
  padding: 6px 8px;
  height: 28px;
  box-sizing: border-box;
  cursor: text;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  align-items: center;
  transition: border-color 0.15s;
}

.tft-picker-hex-input.tca-focused {
  border-color: ${BORDER_COLOR_FOCUS};
}

.tft-picker-hex-cursor {
  display: inline-block;
  width: 1px;
  height: 1em;
  background: ${COLOR_WHITE};
  margin: 0 -1px;
  vertical-align: text-bottom;
  animation: tft-cursor-blink 1s step-end infinite;
}

.tft-picker-hex-char {
  white-space: pre;
}

.tft-picker-hex-csel {
  background: #357DF966;
  border-radius: 1px;
}

@keyframes tft-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.tft-picker-hex-picker {
  background: transparent;
  border: 1px solid ${BORDER_COLOR};
  padding: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.tft-picker-hex-picker:hover { background: rgba(255, 255, 255, 0.05); }

.tft-gradient-stops {
  display: flex;
  gap: 4px;
  margin: 0 0 8px;
}

.tft-gradient-stops.tca-hidden { display: none; }
.tft-gradient-stop-swatch {
  flex: 1;
  height: 28px;
  border-radius: 10px;
}

.tft-gradient-stop-swatch .tft-color-swatch {
  width: 100%;
  height: 100%;
  border-radius: 7px;
}
`;
