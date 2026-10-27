import { useSyncExternalStore } from 'react';

const subscribeToNothing = () => () => {};

/**
 * `false` on the server and during the hydration render, `true` after React has
 * hydrated. Gate client-only output behind it — current time, values read from
 * localStorage, `window`/`matchMedia` lookups — so the first client render
 * matches the server-rendered HTML instead of failing hydration. Both renders
 * agree on `false`; React re-renders with `true` right after hydration.
 *
 * See vault skill react-router-framework-mode/references/hydration.md.
 */
export function useHydrated() {
	return useSyncExternalStore(
		subscribeToNothing,
		() => true,
		() => false,
	);
}
