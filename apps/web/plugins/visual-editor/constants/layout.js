/** Numeric spacing and sizing values (px) used to position editor UI. */

/** Gap (px) between a panel and its anchor element. */
export const PANEL_GAP = 4;
/** Minimum margin (px) from the viewport edge when positioning panels. */
export const PANEL_MARGIN = 8;
/** Reserved height (px) of the parent Horizons toolbar when positioning iframe UI. */
export const PARENT_TOOLBAR_HEIGHT = 68;
/** Offset (px) from the cursor to the type tooltip's top-left corner. */
export const TYPE_TOOLTIP_CURSOR_OFFSET = 12;
/** Minimum margin (px) from the viewport edge when clamping the type tooltip. */
export const TOOLTIP_VIEWPORT_MARGIN = 4;
/** Border width (px) of the dashed hover outline drawn around the hovered element. */
export const HOVER_OUTLINE_STROKE_WIDTH = 1;
/** Width (px) of the annotation panel. */
export const ANNOTATION_PANEL_WIDTH = 320;
/** Estimated height (px) of the annotation panel for positioning calculations. */
export const ANNOTATION_PANEL_ESTIMATED_HEIGHT = 184;
/** Pointer travel (px) from mousedown before a click becomes a drag-select. */
export const DRAG_SELECT_THRESHOLD = 4;
/** Smallest side (px) an element may have to be worth drag-selecting. */
export const MIN_SELECTION_CANDIDATE_SIZE = 8;
/** Elements one annotation may target. Matches the backend's cap so a drag can never build a payload the API rejects.*/
export const MAX_SELECTED_ELEMENTS = 20;
/** Reference images across all annotations in one visual-editor turn. */
export const MAX_ANNOTATION_ATTACHMENTS = 10;
