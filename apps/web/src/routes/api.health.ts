import { json, withApi } from '@/lib/api.server';

export const loader = withApi(async () => json({ ok: true }));
