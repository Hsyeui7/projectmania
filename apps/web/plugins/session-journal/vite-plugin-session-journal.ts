import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild, type Plugin } from 'vite';

const VIRTUAL_ID = 'virtual:session-journal-client';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_PATH = path.resolve(PLUGIN_DIR, 'session-journal-client.ts');

export default function sessionJournalPlugin(): Plugin {
	return {
		name: 'session-journal',
		apply: 'serve',

		resolveId(id, importer) {
			if (id === VIRTUAL_ID) {
				return RESOLVED_ID;
			}
			if (importer === RESOLVED_ID && id.startsWith('.')) {
				return path.resolve(PLUGIN_DIR, id);
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
