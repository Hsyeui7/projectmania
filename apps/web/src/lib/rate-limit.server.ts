/**
 * Fixed-window rate limiter for `/api/*` resource routes.
 *
 * Counters live in this server process only. Never apply this to page routes —
 * a single page load fans out into many requests and would exhaust the window
 * immediately.
 *
 * `rate-limiter-flexible` does the counting and `ipaddr.js` parses the address.
 * What is left here is deciding which caller a request belongs to: the left-most
 * `X-Forwarded-For` entry, with IPv6 grouped by /56 so a caller cannot rotate
 * addresses for a fresh window.
 */
import ipaddr from 'ipaddr.js';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

const MS_PER_SECOND = 1000;
const WINDOW_SECONDS = 5 * 60;
const MAX_REQUESTS_PER_WINDOW = 100;

export type RateLimitVerdict = {
	isLimited: boolean;
	limit: number;
	remaining: number;
	resetSeconds: number;
};

/** 7 bytes of a 16-byte address make up the /56 prefix. */
const IPV6_PREFIX_BYTES = 7;

/**
 * The proxy in front of this server rewrites `X-Forwarded-For`, so the left-most
 * entry is the real client. Direct requests (no proxy) share the `unknown` bucket.
 */
export const clientIdentifier = (request: Request): string => {
	const [forwarded] = request.headers.get('x-forwarded-for')?.split(',') ?? [];
	const address = forwarded?.trim() || request.headers.get('x-real-ip')?.trim();

	if (!address) {
		return 'unknown';
	}

	try {
		const parsed = ipaddr.parse(address);

		if (!(parsed instanceof ipaddr.IPv6)) {
			return address;
		}

		// IPv4 is counted per address, including when it arrives mapped into IPv6.
		if (parsed.isIPv4MappedAddress()) {
			return parsed.toIPv4Address().toString();
		}

		// A caller can rotate through their own allocation at will, so counting per
		// address would be trivial to sidestep. Bucket by /56 instead.
		return parsed.toByteArray().slice(0, IPV6_PREFIX_BYTES).join('.');
	} catch {
		// Not something we can parse as an address; count it under its literal value.
		return address;
	}
};

const sharedLimiter = new RateLimiterMemory({
	points: MAX_REQUESTS_PER_WINDOW,
	duration: WINDOW_SECONDS,
});

/**
 * Spending the budget rejects with the same result object a success resolves
 * with; anything else is the store failing and must not pass as a verdict.
 */
const consume = async (
	limiter: RateLimiterMemory,
	identifier: string,
): Promise<{ result: RateLimiterRes; isLimited: boolean }> => {
	try {
		return { result: await limiter.consume(identifier), isLimited: false };
	} catch (error) {
		if (error instanceof RateLimiterRes) {
			return { result: error, isLimited: true };
		}

		throw error;
	}
};

export const consumeRateLimit = async (identifier: string): Promise<RateLimitVerdict> => {
	const { result, isLimited } = await consume(sharedLimiter, identifier);

	return {
		isLimited,
		limit: MAX_REQUESTS_PER_WINDOW,
		remaining: result.remainingPoints,
		resetSeconds: Math.max(0, Math.ceil(result.msBeforeNext / MS_PER_SECOND)),
	};
};

/**
 * A tighter budget for one endpoint that costs more than a plain read, charged
 * on top of the allowance every `/api/*` route already gets. Returns false once
 * the caller has spent it, so the handler can answer 429.
 */
export const createRateLimiter = ({
	maxRequests,
	windowSeconds,
}: {
	maxRequests: number;
	windowSeconds: number;
}): ((identifier: string) => Promise<boolean>) => {
	const limiter = new RateLimiterMemory({ points: maxRequests, duration: windowSeconds });

	return async identifier => !(await consume(limiter, identifier)).isLimited;
};

/** IETF draft `RateLimit-*` headers. */
export const rateLimitHeaders = (verdict: RateLimitVerdict): Record<string, string> => {
	const headers: Record<string, string> = {
		'RateLimit-Policy': `${verdict.limit};w=${WINDOW_SECONDS}`,
		'RateLimit-Limit': String(verdict.limit),
		'RateLimit-Remaining': String(verdict.remaining),
		'RateLimit-Reset': String(verdict.resetSeconds),
	};

	if (verdict.isLimited) {
		headers['Retry-After'] = String(verdict.resetSeconds);
	}

	return headers;
};
