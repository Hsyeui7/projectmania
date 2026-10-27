import { createLogger } from 'vite';
import type { Plugin } from 'vite';

export default function horizonsLoggerPlugin(): Plugin {
	console.warn = () => {};

	return {
		name: 'horizons-logger',
		config() {
			const logger = createLogger();
			const loggerError = logger.error;

			logger.error = (msg, options) => {
				if (options?.error?.toString().includes('CssSyntaxError: [postcss]')) {
					return;
				}

				loggerError(msg, options);
			};

			return { customLogger: logger };
		},
	};
}
