import { SIZE_ACTION_ID } from './template.js';
import { PANEL_BG, BORDER_COLOR, HOVER_BG, ACTIVE_BG, BOX_SHADOW_DROPDOWN, COLOR_WHITE } from '../../../constants/theme.js';

/** Injected CSS for the font size dropdown panel. */
export const SIZE_ACTION_STYLES = `
#${SIZE_ACTION_ID} {
  position: fixed;
  display: none;
  flex-direction: column;
  overflow-y: auto;
  max-height: 240px;
  background: ${PANEL_BG};
  border: 1px solid ${BORDER_COLOR};
  border-radius: 12px;
  padding: 4px;
  box-shadow: ${BOX_SHADOW_DROPDOWN};
  font-family: DM Sans, sans-serif;
  user-select: none;
}

#${SIZE_ACTION_ID}.tsa-visible { 
  display: flex; 
}

.tft-size-option {
  padding: 6px 12px;
  color: ${COLOR_WHITE};
  font-size: 12px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
  
.tft-size-option:hover { 
  background: ${HOVER_BG}; 
}

.tft-size-option.tsa-active { 
  background: ${ACTIVE_BG}; 
}
`;
