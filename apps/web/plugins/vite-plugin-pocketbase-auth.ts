import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild, type Plugin } from 'vite';

const VIRTUAL_ID = 'virtual:horizons-pocketbase-auth';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_PATH = path.resolve(PLUGIN_DIR, 'pocketbase-auth-client.ts');

export default function pocketbaseAuthPlugin(): Plugin {
	return {
		name: 'vite:pocketbase-auth',
		apply: 'serve',

		resolveId(id) {
			if (id === VIRTUAL_ID) {
				return RESOLVED_ID;
			}
		},

		async load(id) {
			if (id === RESOLVED_ID) {
				const code = await fs.readFile(CLIENT_PATH, 'utf-8');
				const result = await transformWithEsbuild(code, CLIENT_PATH);
				return result.code;
			}
		},
	};
}
