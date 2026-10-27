import { context } from 'esbuild';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { EDIT_MODE_STYLES } from './ui/inline-edit/styles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const VIRTUAL_ID = 'virtual:horizons-edit-mode';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

/**
 * Bundles the multi-file contenteditable edit-mode runtime with esbuild and
 * exposes it as a Vite virtual module (plus injects edit-mode styles into document.head).
 *
 * @returns {import('vite').Plugin}
 */
export default function inlineEditDevPlugin() {
	let buildContext = null;

	return {
		name: 'vite:inline-edit-dev',
		apply: 'serve',

		async buildStart() {
			buildContext = await context({
				entryPoints: [resolve(__dirname, 'edit-mode-script.js')],
				bundle: true,
				format: 'esm',
				sourcemap: 'inline',
				write: false,
				platform: 'browser',
				target: 'es2020',
			});
		},

		resolveId(id) {
			if (id === VIRTUAL_ID) {
				return RESOLVED_VIRTUAL_ID;
			}
		},

		async load(id) {
			if (id !== RESOLVED_VIRTUAL_ID) {
				return;
			}

			const { outputFiles } = await buildContext.rebuild();
			const bundledScript = outputFiles[0].text;
			const injectStyles = `
(() => {
	const style = document.createElement('style');
	style.textContent = ${JSON.stringify(EDIT_MODE_STYLES)};
	document.head.appendChild(style);
})();
`;

			return `${injectStyles}\n${bundledScript}`;
		},

		closeBundle() {
			buildContext?.dispose();
		},
	};
}
