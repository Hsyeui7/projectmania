const ALLOWED_PARENT_ORIGINS = [
	"https://horizons.hostinger.com",
	"https://horizons.hostinger.dev",
	"https://ai-builder.hostinger.com",
	"https://ai-builder.hostinger.dev",
	"https://horizons-frontend-local.hostinger.dev",
];

/**
 * Keeps the builder's page selector in sync with the preview, and applies the
 * navigation the builder asks for.
 *
 * The builder points the iframe at a URL only when it (re)loads the preview, so
 * that first document is server-rendered for the route it shows. Every later
 * route change is a client-side navigation inside this document: links in the
 * app, and `navigate-to-route` / `redirect-home` from the builder's page selector
 * and Home button. The builder must not answer the `route-changed` report by
 * rewriting the iframe `src` — that reloads the document and flashes the preview.
 *
 * Nothing in this file may rewrite `location` before hydration — a URL that
 * disagrees with the HTML the server rendered makes React hydrate the wrong
 * route, which fails hydration and snaps the preview back to the previous page.
 */
// Check to see if the page is in an iframe
if (window.self !== window.top) {
	const getCurrentRoute = () => location.pathname + location.search + location.hash;

	const reportRoute = () => {
		try {
			window.parent.postMessage({message: 'route-changed', route: getCurrentRoute()}, '*');
		} catch {}
	};

	let pendingRoute: string | null = null;

	const applyRoute = (route: string) => {
		try {
			history.replaceState(null, '', route);
			window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
		} catch {}
	};

	// HorizonsPreviewScripts sets the flag and fires the event from a useEffect,
	// which React only flushes after the hydration render has committed.
	const isHydrated = () =>
		(window as Window & { __horizonsHydrated?: boolean }).__horizonsHydrated === true;

	// Covers the app never committing at all (a crash before mount): navigation
	// falls back to the old apply-anyway behaviour instead of dead-ending.
	const HYDRATION_WAIT_TIMEOUT_MS = 10000;

	/**
	 * Navigates within the hydrated router rather than reloading, so the messages
	 * the builder sends straight after (an edit-mode draft, for one) still reach a
	 * live listener. Changing `location` while React hydrates is the mismatch
	 * described above. `load` is not a safe gate for that — framework mode hydrates
	 * inside a `startTransition` that commits after it — so this waits for the
	 * `horizons:hydrated` signal HorizonsPreviewScripts emits once React has
	 * committed. Only the route asked for last is applied; replaying the earlier
	 * ones would render every route on the way to it.
	 */
	const navigateTo = (route: string) => {
		if (isHydrated()) {
			applyRoute(route);
			return;
		}

		const isFirstPending = pendingRoute === null;
		pendingRoute = route;

		if (!isFirstPending) return;

		const flushPendingRoute = () => {
			clearTimeout(fallbackTimeoutId);
			window.removeEventListener('horizons:hydrated', flushPendingRoute);

			const queued = pendingRoute;
			pendingRoute = null;

			if (queued) applyRoute(queued);
		};

		const fallbackTimeoutId = setTimeout(flushPendingRoute, HYDRATION_WAIT_TIMEOUT_MS);
		window.addEventListener('horizons:hydrated', flushPendingRoute, { once: true });
	};

	const originalPushState = history.pushState;
	history.pushState = function(...args) {
		originalPushState.apply(this, args);
		reportRoute();
	};

	const originalReplaceState = history.replaceState;
	history.replaceState = function(...args) {
		originalReplaceState.apply(this, args);
		reportRoute();
	};

	const getParentOrigin = () => {
		if (
			window.location.ancestorOrigins &&
			window.location.ancestorOrigins.length > 0
		) {
			return window.location.ancestorOrigins[0];
		}

		if (document.referrer) {
			try {
				return new URL(document.referrer).origin;
			} catch (e) {
				console.warn("Invalid referrer URL:", document.referrer);
			}
		}

		return null;
	};

	window.addEventListener('popstate', reportRoute);
	window.addEventListener('hashchange', reportRoute);
	window.addEventListener("message", function (event) {
		const parentOrigin = getParentOrigin();
		if (!parentOrigin || !ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) return;

		if (event.data?.type === "redirect-home" && getCurrentRoute() !== '/') {
			navigateTo('/');
		}

		if (event.data?.type === "navigate-to-route" && typeof event.data.path === "string") {
			const target = event.data.path.startsWith('/') ? event.data.path : '/' + event.data.path;
			if (getCurrentRoute() !== target) {
				navigateTo(target);
			}
		}
	});
}
