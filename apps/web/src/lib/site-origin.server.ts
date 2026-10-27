const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

/**
 * The public origin of this site, e.g. `https://example.com`. Use it for
 * absolute URLs that leave the app — sitemap `<loc>`, canonical links, `og:url`.
 *
 * The scheme comes from the hostname because the request cannot report it: TLS
 * terminates at the proxy, so `request.url` and `X-Forwarded-Proto` both say
 * `http` even for a visitor who arrived over HTTPS. Trusting either publishes
 * `http://` URLs that only redirect, which search engines index as a second,
 * duplicate site. Every host this app is reachable on serves HTTPS except a
 * local `npm run start`, which is where the `curl` checks in the SEO skill run.
 *
 * `Host` carries the public domain, and only the origin is read, so the `.data`
 * suffix React Router adds to `request.url` on client navigations does not
 * matter.
 */
export const siteOrigin = (request: Request): string => {
	const { host, hostname } = new URL(request.url);

	return `${LOCAL_HOSTNAMES.has(hostname) ? 'http' : 'https'}://${host}`;
};
