import { PassThrough } from 'node:stream';

import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import type { EntryContext, RouterContextProvider } from 'react-router';
import { ServerRouter } from 'react-router';

export const streamTimeout = 5_000;

// Render errors such as "Element type is invalid" throw with a stack of react-dom internals
// only — the component stack is the sole pointer to the app file that rendered the broken
// element. Appending it means serialized errors and server logs show `src/...` frames.
function appendComponentStack(error: unknown, errorInfo?: { componentStack?: string | null }) {
	const componentStack = errorInfo?.componentStack;

	if (!(error instanceof Error) || !componentStack || error.stack?.includes(componentStack)) {
		return;
	}

	const separator = componentStack.startsWith('\n') ? '' : '\n';

	try {
		error.stack = `${error.stack ?? `${error.name}: ${error.message}`}${separator}${componentStack}`;
	} catch {
		// error.stack can be a readonly accessor on exotic error objects; losing the
		// component stack is acceptable, breaking the error path is not.
	}
}

export default function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	loadContext: RouterContextProvider,
) {
	// https://httpwg.org/specs/rfc9110.html#HEAD
	if (request.method.toUpperCase() === 'HEAD') {
		return new Response(null, {
			status: responseStatusCode,
			headers: responseHeaders,
		});
	}

	return new Promise((resolve, reject) => {
		let shellRendered = false;
		const userAgent = request.headers.get('user-agent');

		// Bots and SPA Mode renders wait for all content so crawlers see the full document.
		const readyOption: keyof RenderToPipeableStreamOptions =
			(userAgent && isbot(userAgent)) || routerContext.isSpaMode
				? 'onAllReady'
				: 'onShellReady';

		// Abort the rendering stream after the `streamTimeout` so it has time to
		// flush down the rejected boundaries.
		let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
			() => abort(),
			streamTimeout + 1000,
		);

		const { pipe, abort } = renderToPipeableStream(
			<ServerRouter
				context={routerContext}
				url={request.url}
			/>,
			{
				[readyOption]() {
					shellRendered = true;
					const body = new PassThrough({
						final(callback) {
							// Clear the timeout to prevent retaining the closure and memory leak.
							clearTimeout(timeoutId);
							timeoutId = undefined;
							callback();
						},
					});
					const stream = createReadableStreamFromReadable(body);

					responseHeaders.set('Content-Type', 'text/html');

					pipe(body);

					resolve(
						new Response(stream, {
							headers: responseHeaders,
							status: responseStatusCode,
						}),
					);
				},
				onShellError(error: unknown) {
					reject(error);
				},
				onError(error: unknown, errorInfo: { componentStack?: string | null }) {
					appendComponentStack(error, errorInfo);
					responseStatusCode = 500;
					// Log streaming rendering errors from inside the shell. Don't log
					// errors encountered during initial shell rendering since they'll
					// reject and get logged in handleDocumentRequest.
					if (shellRendered) {
						console.error(error);
					}
				},
			},
		);
	});
}
