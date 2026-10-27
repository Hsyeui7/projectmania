/** Origins allowed to receive messages from this iframe. */
export const ALLOWED_PARENT_ORIGINS = [
	'https://horizons.hostinger.com',
	'https://horizons.hostinger.dev',
	'https://ai-builder.hostinger.com',
	'https://ai-builder.hostinger.dev',
	'https://horizons-frontend-local.hostinger.dev',
	'http://localhost:4000',
];

/**
 * Resolves the parent frame origin from `ancestorOrigins` or `document.referrer`.
 * @returns {string | null}
 */
export function getParentOrigin() {
	if (window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
		return window.location.ancestorOrigins[0];
	}

	if (document.referrer) {
		try {
			return new URL(document.referrer).origin;
		} catch {
			console.warn('[plugin] Invalid referrer URL:', document.referrer);
		}
	}

	return null;
}

/**
 * Sends a typed message to the parent frame when the origin is allowlisted.
 * @param {string} type - A {@link ParentMessage} value.
 * @param {object} [payload]
 */
export function postToParent(type, payload = {}) {
	const parentOrigin = getParentOrigin();
	if (parentOrigin && ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) {
		window.parent.postMessage({ type, payload }, parentOrigin);
	}
}
