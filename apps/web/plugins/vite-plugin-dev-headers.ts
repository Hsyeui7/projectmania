import type { Plugin } from 'vite';

export default function horizonsDevHeadersPlugin(): Plugin {
	return {
		name: 'horizons-dev-headers',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use((_req, res, next) => {
				res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
				next();
			});
		},
	};
}
