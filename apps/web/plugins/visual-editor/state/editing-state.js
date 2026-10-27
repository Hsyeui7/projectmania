/** Active inline edit session; `null` when no element is being edited. */
let current = null;

/**
 * @returns {{ editId: string, targetElement: HTMLElement, sessionId: number, originalContent: string,
 *             originalTextAlign: string, originalInlineStyles: object,
 *             savedChildren: Array, hasSoftSaved?: boolean }|null}
 */
export function getEditing() {
	return current;
}

/**
 * @param {{ editId: string, targetElement: HTMLElement, originalContent: string,
 *            originalTextAlign: string, originalInlineStyles: object,
 *            savedChildren: Array }} info
 */
export function setEditing(info) {
	current = info;
}

/** Clears the active edit session (called on commit or discard). */
export function clearEditing() {
	current = null;
}
