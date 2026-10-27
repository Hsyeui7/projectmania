/**
 * Helpers for `/api/*` resource routes: JSON responses, security headers,
 * rate limiting, body-size limits, and a single error shape.
 *
 * Wrap every resource route handler in `withApi`: there is no global middleware
 * in this app, so the wrapper is what applies these concerns to a route.
 */
import logger from '@/lib/logger.server';
import { clientIdentifier, consumeRateLimit, rateLimitHeaders } from '@/lib/rate-limit.server';

export const BODY_LIMIT_BYTES = 20 * 1024 * 1024;

/**
 * Applied to API responses only. Page responses must stay untouched, because
 * framing and CSP headers break embedding the site in a preview iframe.
 * Transport security (HSTS) belongs to the proxy in front of this server.
 *
 * `Cache-Control: no-store` is defence in depth, not a guarantee: the platform
 * edge cache rewrites this header on published domains and caches `/api/*` GET
 * responses by URL for all visitors. Per-user or authenticated endpoints must
 * therefore be actions (POST) — never GET. Handlers returning public,
 * cache-friendly data may override by setting their own Cache-Control
 * (existing headers are never overwritten here).
 */
const SECURITY_HEADERS: Record<string, string> = {
	'Cache-Control': 'no-store',
	'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
	'Cross-Origin-Resource-Policy': 'same-origin',
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'X-Permitted-Cross-Domain-Policies': 'none',
};

export type ApiArgs = {
	request: Request;
	params: Record<string, string | undefined>;
};

type ApiHandler = (args: ApiArgs) => unknown;

const withExtraHeaders = (response: Response, extra: Record<string, string>): Response => {
	const headers = new Headers(response.headers);

	for (const [name, value] of Object.entries(extra)) {
		if (!headers.has(name)) {
			headers.set(name, value);
		}
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
};

/** JSON response carrying the API security headers. */
export const json = (value: unknown, init: ResponseInit = {}): Response =>
	withExtraHeaders(Response.json(value, init), SECURITY_HEADERS);

/** Client-error response — use for input validation, never for server failures. */
export const apiError = (status: number, message: string): Response => json({ error: message }, { status });

const serverError = (error: unknown): Response => {
	const isProduction = process.env.NODE_ENV === 'production';
	const cause = error instanceof Error ? error : new Error(String(error));

	return json(
		{
			message: 'Something went wrong!',
			...(!isProduction && {
				error: {
					name: cause.name,
					message: cause.message,
					stack: cause.stack,
				},
			}),
		},
		{ status: 500 },
	);
};

const runHandler = async (handler: ApiHandler, args: ApiArgs): Promise<Response> => {
	const verdict = await consumeRateLimit(clientIdentifier(args.request));

	if (verdict.isLimited) {
		return withExtraHeaders(apiError(429, 'Too many requests, please try again later'), rateLimitHeaders(verdict));
	}

	const extraHeaders = rateLimitHeaders(verdict);

	try {
		const result = await handler(args);
		const response = result instanceof Response ? withExtraHeaders(result, SECURITY_HEADERS) : json(result ?? null);

		return withExtraHeaders(response, extraHeaders);
	} catch (error) {
		// `redirect()` and thrown validation responses are control flow, not failures.
		if (error instanceof Response) {
			return withExtraHeaders(error, extraHeaders);
		}

		logger.error(error instanceof Error ? error.message : error, error instanceof Error ? error.stack : undefined);

		return withExtraHeaders(serverError(error), extraHeaders);
	}
};

/**
 * Wraps a resource route `loader` / `action`. Rate limits the caller, adds
 * security headers, logs the request, and turns any thrown error into the shared
 * 500 shape — so handlers can `throw new Error(...)` instead of building error
 * responses.
 */
export const withApi = (handler: ApiHandler): ((args: ApiArgs) => Promise<Response>) => {
	return async (args: ApiArgs) => {
		const startedAt = Date.now();
		const response = await runHandler(handler, args);
		const { pathname } = new URL(args.request.url);

		logger.info(`${args.request.method} ${pathname} ${response.status} ${Date.now() - startedAt}ms`);

		return response;
	};
};

/**
 * Reads the body while enforcing `BODY_LIMIT_BYTES`.
 *
 * `content-length` alone is not a limit: it is absent on chunked/streamed
 * requests, so a client can omit it and send unbounded data. Counting bytes as
 * they arrive and aborting mid-stream is what actually caps memory, so both
 * readers below go through here.
 */
const readBodyWithinLimit = async (request: Request): Promise<Buffer> => {
	const declaredLength = Number(request.headers.get('content-length'));

	if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
		throw apiError(413, 'Request body too large');
	}

	if (!request.body) {
		return Buffer.alloc(0);
	}

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			if (!value) {
				continue;
			}

			receivedBytes += value.byteLength;

			if (receivedBytes > BODY_LIMIT_BYTES) {
				await reader.cancel();

				throw apiError(413, 'Request body too large');
			}

			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	return Buffer.concat(chunks);
};

/** `request.json()` with a 20MB cap — nothing else limits how much a client can send. */
export const readJsonBody = async <T>(request: Request): Promise<T> => {
	const body = (await readBodyWithinLimit(request)).toString('utf8');

	try {
		return JSON.parse(body) as T;
	} catch {
		throw apiError(400, 'Invalid JSON body');
	}
};

/** `request.formData()` with the same 20MB limit. */
export const readFormData = async (request: Request): Promise<FormData> => {
	const body = await readBodyWithinLimit(request);
	const contentType = request.headers.get('content-type');

	// Re-parse from the size-checked buffer; the content type carries the
	// multipart boundary, so formData() cannot decode without it. Response takes a
	// web BodyInit, which a Node Buffer is not, hence the Uint8Array view.
	return new Response(new Uint8Array(body), {
		...(contentType && { headers: { 'content-type': contentType } }),
	}).formData();
};
