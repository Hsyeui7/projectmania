import { useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbase-client';

/**
 * Session state for the signed-in PocketBase user: user, isAuthed, isLoading,
 * login, signup, logout. No provider to mount — every caller reads the same
 * `pb.authStore`.
 *
 * The JWT is persisted in localStorage, which the server cannot read, so the
 * session is filled in after hydration. Render on `isLoading` (a spinner, a
 * skeleton) instead of the signed-out state, or a signed-in visitor sees a
 * "Sign in" button flash on every page load.
 */
export function useAuth() {
	const [user, setUser] = useState<typeof pb.authStore.record>(null);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setUser(pb.authStore.record);
		setIsLoading(false);

		return pb.authStore.onChange((_token, record) => setUser(record));
	}, []);

	return useMemo(
		() => ({
			user,
			isAuthed: Boolean(user),
			isLoading,
			login: (email: string, password: string) =>
				pb.collection('users').authWithPassword(email, password),
			signup: async (
				email: string,
				password: string,
				extraFields: Record<string, unknown> = {},
			) => {
				await pb.collection('users').create({
					email,
					password,
					passwordConfirm: password,
					...extraFields,
				});

				return pb.collection('users').authWithPassword(email, password);
			},
			logout: () => pb.authStore.clear(),
		}),
		[user, isLoading],
	);
}

export default useAuth;
