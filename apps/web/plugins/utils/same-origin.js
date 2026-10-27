/**
 * Whether a dev-server API request came from the preview page itself.
 *
 * This is a cross-origin/CSRF control, NOT authorization. `Sec-Fetch-Site` is
 * client-supplied and the preview URL needs no credentials, so a crafted request
 * that sets the header still gets through. What it does stop: browser-driven
 * cross-origin writes, and clients that send no fetch metadata at all.
 *
 * Browsers label the preview's own same-origin `fetch` calls
 * `Sec-Fetch-Site: same-origin`. Hosts are compared rather than full origins
 * because the request reaches Vite over plain HTTP behind the proxy, which
 * forwards the original `Host`.
 *
 * @param {import('node:http').IncomingMessage} request
 * @returns {boolean}
 */
export function isSameOriginRequest(request) {
	const site = request.headers['sec-fetch-site'];
	if (site) {
		return site === 'same-origin';
	}

	// Pre-16.4 Safari omits fetch metadata but still sends `Origin` on POST.
	const origin = request.headers.origin;
	if (!origin) {
		return false;
	}

	try {
		return new URL(origin).host === request.headers.host;
	} catch {
		return false;
	}
}
