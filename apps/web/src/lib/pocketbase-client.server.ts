/**
 * Superuser PocketBase access for loaders and actions.
 *
 * Authentication is lazy: importing this module never blocks the server, and a
 * failed attempt is retried on the next call. Only reach for it when the request
 * genuinely needs to bypass collection access rules (webhooks, third-party
 * orchestration, server-side aggregation). Anything acting on behalf of the
 * signed-in user belongs in the browser client, where PocketBase rules apply.
 *
 * Requires PocketBase to be running, with `PB_SUPERUSER_EMAIL` and
 * `PB_SUPERUSER_PASSWORD` present in the environment.
 */
import type { ListResult, SendOptions } from 'pocketbase';
import PocketBase, { ClientResponseError } from 'pocketbase';
import logger from '@/lib/logger.server';

const HEALTH_RETRIES = 10;
const HEALTH_RETRY_DELAY_MS = 1000;
const SUPERUSERS_COLLECTION = '_superusers';

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

export type RecordListResult<T> = ListResult<T>;

const pb = new PocketBase(pocketbaseUrl());

// The SDK cancels an in-flight request when a later one reuses its key. That is
// right in a browser, but here concurrent loaders share this single client and
// would abort each other.
pb.autoCancellation(false);

let authPromise: Promise<void> | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async () => {
	for (let attempt = 1; attempt <= HEALTH_RETRIES; attempt += 1) {
		try {
			await pb.health.check();

			return;
		} catch {
			// PocketBase not reachable yet; retry below
		}

		logger.warn(`PocketBase not ready, retrying (${attempt}/${HEALTH_RETRIES})...`);

		await sleep(HEALTH_RETRY_DELAY_MS);
	}

	throw new Error(`PocketBase health check failed after ${HEALTH_RETRIES} retries`);
};

const authenticate = async () => {
	const identity = process.env.PB_SUPERUSER_EMAIL;
	const password = process.env.PB_SUPERUSER_PASSWORD;

	if (!identity || !password) {
		throw new Error('PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD are not set — is PocketBase enabled?');
	}

	await waitForHealth();
	await pb.collection(SUPERUSERS_COLLECTION).authWithPassword(identity, password);
};

/** Authenticates once and reuses the token until `authStore` reports it expired. */
const ensureAuth = async (): Promise<void> => {
	if (pb.authStore.isValid) {
		return;
	}

	if (!authPromise) {
		authPromise = authenticate().finally(() => {
			authPromise = null;
		});
	}

	return authPromise;
};

/** Re-authenticates once if PocketBase rejects a token it had previously accepted. */
const withFreshToken = async <T>(request: () => Promise<T>): Promise<T> => {
	await ensureAuth();

	try {
		return await request();
	} catch (error) {
		if (!(error instanceof ClientResponseError) || error.status !== 401) {
			throw error;
		}

		pb.authStore.clear();
		await ensureAuth();

		return request();
	}
};

/** `page` and `perPage` are positional in the SDK; everything else is a query option. */
type ListQuery = Record<string, string | number | boolean>;

/** `FormData` keeps file uploads multipart; a plain object is sent as JSON. */
type RecordData = FormData | Record<string, unknown>;

const splitListQuery = ({ page, perPage, ...options }: ListQuery) => ({
	page: Number(page ?? 1),
	perPage: Number(perPage ?? 30),
	options,
});

export const pocketbaseAdmin = {
	/**
	 * Builds a `filter` with values bound as parameters, e.g.
	 * `filter('slug = {:slug}', { slug })`. Never interpolate request values into a
	 * filter string: this client bypasses collection rules, so a crafted value could
	 * query any record in any collection.
	 */
	filter: (expression: string, params: Record<string, unknown>) => pb.filter(expression, params),

	listRecords: <T>(collection: string, query: ListQuery = {}) => {
		const { page, perPage, options } = splitListQuery(query);

		return withFreshToken(() => pb.collection(collection).getList<T>(page, perPage, options));
	},

	getRecord: <T>(collection: string, id: string, query: ListQuery = {}) =>
		withFreshToken(() => pb.collection(collection).getOne<T>(id, query)),

	createRecord: <T>(collection: string, data: RecordData) =>
		withFreshToken(() => pb.collection(collection).create<T>(data)),

	/** One transaction, so a failure part-way through leaves nothing written. */
	createRecords: async (collection: string, records: RecordData[]): Promise<void> => {
		const batch = pb.createBatch();

		records.forEach(record => batch.collection(collection).create(record));

		await withFreshToken(() => batch.send());
	},

	updateRecord: <T>(collection: string, id: string, data: RecordData) =>
		withFreshToken(() => pb.collection(collection).update<T>(id, data)),

	deleteRecord: async (collection: string, id: string): Promise<void> => {
		await withFreshToken(() => pb.collection(collection).delete(id));
	},

	/** Short-lived token that grants read access to files in protected collections. */
	getFileToken: () => withFreshToken(() => pb.files.getToken()),

	/**
	 * Escape hatch for endpoints the SDK has no method for — a custom route added
	 * with `routerAdd` in `apps/pocketbase/pb_hooks`. Everything PocketBase ships
	 * itself is covered above or by the SDK; reach for those first.
	 */
	send: <T>(path: string, init: SendOptions = {}) => withFreshToken(() => pb.send<T>(path, init)),
};

export default pocketbaseAdmin;
