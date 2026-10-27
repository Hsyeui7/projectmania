interface RouterState {
	errors?: Record<string, unknown> | null;
}

interface DataRouter {
	state: RouterState;
	subscribe: (listener: (state: RouterState) => void) => () => void;
}

function resolveFetchUrl(input) {
	if (typeof input === 'string') {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	if (input && typeof input.url === 'string') {
		return input.url;
	}
	return String(input ?? '');
}

if (typeof window !== 'undefined') {
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const addedNode of mutation.addedNodes) {
				if (
					addedNode.nodeType === Node.ELEMENT_NODE
					&& (
						(addedNode as Element).tagName?.toLowerCase() === 'vite-error-overlay'
						|| (addedNode as Element).classList?.contains('backdrop')
					)
				) {
					handleViteOverlay(addedNode as Element);
				}
			}
		}
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
	});

	function handleViteOverlay(node) {
		if (!node.shadowRoot) {
			return;
		}

		const backdrop = node.shadowRoot.querySelector('.backdrop');

		if (backdrop) {
			const overlayHtml = backdrop.outerHTML;
			const parser = new DOMParser();
			const doc = parser.parseFromString(overlayHtml, 'text/html');
			const messageBodyElement = doc.querySelector('.message-body');
			const fileElement = doc.querySelector('.file');
			const messageText = messageBodyElement ? messageBodyElement.textContent.trim() : '';

			// A sandbox restart severs vite's module runner mid-request and the overlay
			// shows "transport was disconnected" — infra churn, not an app error to fix.
			if (messageText.includes('transport was disconnected')) {
				return;
			}

			const fileText = fileElement ? fileElement.textContent.trim() : '';
			const error = messageText + (fileText ? ` File:${fileText}` : '');

			window.parent.postMessage({
				type: 'horizons-vite-error',
				error,
			}, '*');
		}
	}

	window.onerror = (message, source, lineno, colno, errorObj) => {
		const errorDetails = errorObj ? JSON.stringify({
			name: errorObj.name,
			message: errorObj.message,
			stack: errorObj.stack,
			source,
			lineno,
			colno,
		}) : null;

		window.parent.postMessage({
			type: 'horizons-runtime-error',
			message,
			error: errorDetails,
		}, '*');
	};

	const ROUTER_POLL_INTERVAL_MS = 100;
	const ROUTER_POLL_TIMEOUT_MS = 20000;

	// Captured ahead of the console patches below so that giving up does not travel back to the
	// editor as a horizons-console-warn.
	const unpatchedConsoleWarn = console.warn;

	let lastReportedRouterError: string | null = null;

	const PREVIEW_STARTING_MARKER = 'Your preview is starting';

	const STACK_FRAME_LINE_REGEX = /^\s*at\s/;
	// Some frames carry the workspace path twice (…/src/<dir>/apps/web/src/<dir>/file.tsx),
	// so anchoring on the first `/src/` would report a path that does not exist. The greedy
	// prefix anchors on the LAST `apps/web/` so even a doubled `apps/web/src/` resolves to
	// the real file; the bare `/src/` form stays as the fallback for browser frames
	// (`http://host/src/…`), which never contain `apps/web/`.
	const WORKSPACE_STACK_FRAME_REGEX = /.*\/apps\/web\/(src\/[^\s):]+:\d+:\d+)/;
	const APP_STACK_FRAME_REGEX = /\/(src\/[^\s):]+:\d+:\d+)/;

	const MAX_APP_STACK_FRAMES = 4;

	function appStackFrames(stack: unknown) {
		if (typeof stack !== 'string') {
			return [];
		}

		const frames: string[] = [];

		for (const line of stack.split('\n')) {
			// A dependency shipping its own `src/` (…/node_modules/lib/src/index.js:10:5) would
			// otherwise match and point the reader at a file that does not exist in apps/web.
			if (!STACK_FRAME_LINE_REGEX.test(line) || line.includes('/node_modules/')) {
				continue;
			}

			const match = line.match(WORKSPACE_STACK_FRAME_REGEX) ?? line.match(APP_STACK_FRAME_REGEX);

			if (match && !frames.includes(match[1])) {
				frames.push(match[1]);

				if (frames.length === MAX_APP_STACK_FRAMES) {
					break;
				}
			}
		}

		return frames;
	}

	function formatRouterError(error: unknown) {
		if (error instanceof Error) {
			// `Error` alone says nothing the message does not; a subclass name does. Never
			// return '' — an empty message would drop the report and fail the page silently.
			return error.name && error.name !== 'Error'
				? `${error.name}: ${error.message}`
				: error.message || error.name || 'Error';
		}

		if (!error || typeof error !== 'object') {
			return error ? String(error) : null;
		}

		const { status, statusText, data, message } = error as {
			status?: unknown;
			statusText?: unknown;
			data?: unknown;
			message?: unknown;
		};

		// Thrown responses (404s, `data()` rejections) are how a route says no, not a fault to fix.
		if (typeof status === 'number') {
			if (status < 500) {
				return null;
			}

			// While the sandbox cold-starts, data requests get the "Your preview is
			// starting" interstitial as a 503 — infra being slow, not an app error.
			if (typeof data === 'string' && data.includes(PREVIEW_STARTING_MARKER)) {
				return null;
			}

			const detail = typeof data === 'string' && data ? `: ${data}` : '';

			return `${status} ${statusText || 'Server Error'}${detail}`;
		}

		// Anything else thrown from a loader reaches us untouched, so dig out something readable
		// rather than posting the "[object Object]" that String() would give.
		if (typeof message === 'string' && message) {
			return message;
		}

		try {
			return JSON.stringify(error);
		}
		catch {
			return String(error);
		}
	}

	// A server-rendered page fails as a whole, so the route and file matter as much as the
	// message. Both consumers truncate, hence they lead.
	function describeRouterError(routeId: string, error: unknown) {
		const message = formatRouterError(error);

		if (!message) {
			return null;
		}

		const frames = error instanceof Error ? appStackFrames(error.stack) : [];
		const origin = frames.length ? `${routeId}, ${frames[0]}` : routeId;
		const report = `SSR error on ${window.location.pathname} (${origin}): ${message}`;

		// The first frame can be a shared component rendering a broken element it was
		// handed; the frames above it name the caller to fix. They go at the end so the
		// frontend logger's ~255-char window keeps the headline while the ask-to-fix
		// path (10k chars) keeps the full render path.
		return frames.length > 1 ? `${report}\n(render path: ${frames.slice(1).join(' ← ')})` : report;
	}

	function reportRouterErrors(state: RouterState) {
		// Runs on every router state change, so leave the healthy path allocation-free.
		if (!state.errors) {
			lastReportedRouterError = null;

			return;
		}

		const error = Object.entries(state.errors)
			.map(([routeId, routeError]) => describeRouterError(routeId, routeError))
			.filter((message): message is string => !!message)
			.join('\n');

		if (!error) {
			lastReportedRouterError = null;

			return;
		}

		if (error === lastReportedRouterError) {
			return;
		}

		lastReportedRouterError = error;

		window.parent.postMessage({
			type: 'horizons-ssr-error',
			error,
		}, '*');
	}

	function watchRouterErrors() {
		const router = (window as unknown as { __reactRouterDataRouter?: DataRouter }).__reactRouterDataRouter;

		if (!router) {
			return false;
		}

		reportRouterErrors(router.state);
		router.subscribe(reportRouterErrors);

		return true;
	}

	// A failed server render arrives as a 500 document, so nothing throws in the browser and
	// window.onerror stays silent. React Router replays the error into the router it hydrates,
	// which in dev only exists once the scripts below this one have run.
	if (!watchRouterErrors()) {
		const routerPollStartedAt = Date.now();

		const routerPollInterval = setInterval(() => {
			if (watchRouterErrors()) {
				clearInterval(routerPollInterval);

				return;
			}

			if (Date.now() - routerPollStartedAt > ROUTER_POLL_TIMEOUT_MS) {
				clearInterval(routerPollInterval);
				// __reactRouterDataRouter is undocumented, so a React Router upgrade could drop it.
				unpatchedConsoleWarn('[horizons-runtime] React Router data router never appeared, SSR errors will not be reported.');
			}
		}, ROUTER_POLL_INTERVAL_MS);
	}

	const originalConsoleError = console.error;
	const MATCH_LINE_COL_REGEX = /:(\d+):(\d+)\)?\s*$/;
	const MATCH_AT_REGEX = /^\s*at\s+(?:async\s+)?(?:.*?\s+)?\(?/;
	const MATCH_PATH_REGEX = /^\//;

	function parseStackFrameLine(line) {
		const lineColMatch = line.match(MATCH_LINE_COL_REGEX);
		if (!lineColMatch) return null;
		const [, lineNum, colNum] = lineColMatch;
		const suffix = `:${lineNum}:${colNum}`;
		const idx = line.lastIndexOf(suffix);
		if (idx === -1) return null;
		const before = line.substring(0, idx);
		const stackPath = before.replace(MATCH_AT_REGEX, '').trim();

		if (!stackPath) return null;

		try {
			const pathname = new URL(stackPath).pathname;
			const filePath = pathname.replace(MATCH_PATH_REGEX, '') || pathname;
			return `${filePath}:${lineNum}:${colNum}`;
		} catch {
			const filePath = stackPath.replace(MATCH_PATH_REGEX, '') || stackPath;
			return `${filePath}:${lineNum}:${colNum}`;
		}
	}

	function getFilePathFromStack(stack, skipFrames = 0) {
		if (!stack || typeof stack !== 'string') return null;
		const lines = stack.split('\n').slice(1);

		const frames = lines.map(line => parseStackFrameLine(line.replace(/\r$/, ''))).filter(Boolean);

		return frames[skipFrames] ?? null;
	}

	function formatConsoleMessage(args, skipStackFrames = 1) {
		let messageString = '';
		let filePath: string | null = null;

		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			if (arg instanceof Error) {
				filePath = getFilePathFromStack(arg.stack, 0);
				messageString = `${arg.name}: ${arg.message}`;
				if (filePath) {
					messageString = `${messageString} at ${filePath}`;
				}
				break;
			}
		}

		if (!messageString) {
			messageString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
			const stack = new Error().stack;
			filePath = getFilePathFromStack(stack, skipStackFrames);
			if (filePath) {
				messageString = `${messageString} at ${filePath}`;
			}
		}

		return messageString;
	}

	console.error = function(...args) {
		originalConsoleError.apply(console, args);

		window.parent.postMessage({
			type: 'horizons-console-error',
			error: formatConsoleMessage(args, 1),
		}, '*');
	};

	const originalConsoleWarn = console.warn;

	console.warn = function(...args) {
		originalConsoleWarn.apply(console, args);

		window.parent.postMessage({
			type: 'horizons-console-warn',
			warning: formatConsoleMessage(args, 1),
		}, '*');
	};

	const BENIGN_FETCH_ERRORS = [
		[/hcgi\/platform\/api\/collections\/.*auth-with-password.*/i, /Failed to authenticate/i],
		[/hcgi\/api\//i, /Insufficient credits/i],
		[/hcgi\/api\//i, /INTEGRATION_NOT_CONFIGURED/i],
		// The PocketBase SDK re-establishes its SSE subscription itself after a restart
		// or token refresh; the rejected reconnect attempts in between are churn.
		[/hcgi\/platform\/api\/realtime/i, /Invalid realtime client|previous request authorization/i],
		// Auth endpoints have tight brute-force limits that testing a login flow trips.
		// Only there is a 429 benign: anywhere else it is almost always a fetch loop
		// in app code (the general limit is 200 requests per 5 minutes), so it must
		// stay a console.error for the fix loop to see.
		[/hcgi\/platform\/api\/collections\/[^/]+\/(auth-with-|request-)/i, /Too Many Requests/i],
	];

	function isBenignFetchError(url, body) {
		return BENIGN_FETCH_ERRORS.some(([urlPattern, bodyPattern]) =>
			urlPattern.test(url) && (!bodyPattern || bodyPattern.test(body)));
	}

	const PLATFORM_URL_PATTERN = /hcgi\/platform\//i;
	const VALIDATION_CODE_TEXT_PATTERN = /validation_/;

	function hasValidationCode(value) {
		if (value == null) {
			return false;
		}
		if (typeof value === 'string') {
			return value.startsWith('validation_');
		}
		if (Array.isArray(value)) {
			return value.some(hasValidationCode);
		}
		if (typeof value === 'object') {
			return Object.values(value).some(hasValidationCode);
		}
		return false;
	}

	function isValidationFetchWarning(url, body) {
		if (!PLATFORM_URL_PATTERN.test(url)) {
			return false;
		}
		try {
			return hasValidationCode(JSON.parse(body));
		} catch {
			return VALIDATION_CODE_TEXT_PATTERN.test(body);
		}
	}

	const originalFetch = window.fetch;

	window.fetch = function(...args) {
		const url = resolveFetchUrl(args[0]);

		if (url.startsWith('ws:') || url.startsWith('wss:')) {
			return originalFetch.apply(this, args);
		}

		return originalFetch.apply(this, args)
			.then(async response => {
				const contentType = response.headers.get('Content-Type') || '';

				const isDocumentResponse =
					contentType.includes('text/html')
					|| contentType.includes('application/xhtml+xml');

				// no-cors requests (e.g. Google Analytics/Ads beacons) always return an opaque
				const isOpaqueResponse = response.type === 'opaque';

				if (!response.ok && !isDocumentResponse && !isOpaqueResponse) {
					const responseClone = response.clone();
					const errorFromRes = await responseClone.text();
					const requestUrl = response.url;
					const errorMessage = `Fetch error from ${requestUrl}: ${errorFromRes}`;

					if (isBenignFetchError(requestUrl, errorFromRes)) {
						console.info(errorMessage);
					} else if (isValidationFetchWarning(requestUrl, errorFromRes)) {
						console.warn(errorMessage);
					} else {
						console.error(errorMessage);
					}
				}

				return response;
			})
			.catch(error => {
				if (!url.match(/\.html?$/i)) {
					if (error?.name === 'AbortError') {
						console.info(error);
					} else {
						console.error(error);
					}
				}

				throw error;
			});
	};

	if (window.navigation && window.self !== window.top) {
		window.navigation.addEventListener('navigate', (event) => {
			const url = event.destination.url;

			try {
				const destinationUrl = new URL(url);
				const destinationOrigin = destinationUrl.origin;
				const currentOrigin = window.location.origin;

				if (destinationOrigin === currentOrigin) {
					return;
				}
			} catch {
				return;
			}

			window.parent.postMessage({
				type: 'horizons-navigation-error',
				url,
			}, '*');
		});
	}
}
