import { FONT_ACTION_ID } from './template.js';
import { PANEL_BG, BORDER_COLOR, HOVER_BG, ACTIVE_BG, BOX_SHADOW_DROPDOWN, COLOR_WHITE } from '../../../constants/theme.js';

/** Injected CSS for the font family dropdown panel. */
export const FONT_ACTION_STYLES = `
#${FONT_ACTION_ID} {
  position: fixed;
  display: none;
  flex-direction: column;
  overflow-y: auto;
  max-height: 280px;
  background: ${PANEL_BG};
  border: 1px solid ${BORDER_COLOR};
  border-radius: 12px;
  padding: 4px;
  box-shadow: ${BOX_SHADOW_DROPDOWN};
  user-select: none;
}

#${FONT_ACTION_ID}.tfa-visible { 
  display: flex;
}

.tft-font-option {
  padding: 4px 10px;
  color: ${COLOR_WHITE};
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.tft-font-option:hover { 
  background: ${HOVER_BG}; 
}
  
.tft-font-option.tfa-active { 
  background: ${ACTIVE_BG}; 
}
`;
