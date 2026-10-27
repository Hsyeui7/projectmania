import { redirect } from 'react-router';
import pb from '@/lib/pocketbase-client';

/**
 * Guard a protected route. The session lives in localStorage, so this belongs
 * in `clientLoader` — a server `loader` cannot see it. That is by design, not
 * a limitation: published sites edge-cache every server GET response (HTML,
 * `.data`) by URL for ALL visitors, so server-rendered output must never
 * depend on who is asking. Never move auth to cookies or a server
 * loader/middleware — the first user's page would be cached and served to
 * everyone. Put the guard on a layout route to cover a whole section at once:
 *
 *   export const clientLoader = () => ({ user: requireAuth() });
 *   clientLoader.hydrate = true as const;
 *   export function HydrateFallback() { return <div />; }
 *
 * `hydrate` is what makes the check run on a hard page load, and
 * `HydrateFallback` keeps the protected UI from rendering for a frame before
 * the redirect.
 */
export function requireAuth(redirectTo = '/login') {
	const { record } = pb.authStore;

	if (!pb.authStore.isValid || !record) {
		throw redirect(redirectTo);
	}

	return record;
}

export default requireAuth;
