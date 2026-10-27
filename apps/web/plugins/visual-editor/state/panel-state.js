/** @enum {string} Unique identifier for each action panel. */
export const PanelId = Object.freeze({
    COLOR: 'color',
    FONT:  'font',
    SIZE:  'size',
    LINK:  'link',
});

/**
 * Tracks whether each panel is currently open.
 * @type {Map<string, boolean>}
 */
const visibility = new Map();

/**
 * The hide function supplied by each panel at registration time.
 * @type {Map<string, () => void>}
 */
const hideFunctions = new Map();

/**
 * Register an action panel so it participates in bulk show/hide operations.
 * Called once at module load time by each panel.
 * @param {{ id: string, hide: () => void }} panel
 */
export function registerPanel({ id, hide }) {
    hideFunctions.set(id, hide);
    visibility.set(id, false);
}

/**
 * Update the visibility state for a panel.
 * Called by the panel's own show/hide functions.
 * @param {string} id - A {@link PanelId} value.
 * @param {boolean} visible
 */
export function setPanelVisible(id, visible) {
    visibility.set(id, visible);
}

/**
 * @param {string} id - A {@link PanelId} value.
 * @returns {boolean}
 */
export function isPanelVisible(id) {
    return visibility.get(id) ?? false;
}

/**
 * Hide a single panel by ID.
 * @param {string} id - A {@link PanelId} value.
 */
export function hidePanelById(id) {
    hideFunctions.get(id)?.();
}

/** Hide every registered panel. */
export function hideAllPanels() {
    for (const id of hideFunctions.keys()) hidePanelById(id);
}

/** @returns {boolean} True if at least one panel is currently visible. */
export function anyPanelVisible() {
    return [...visibility.values()].some(Boolean);
}
