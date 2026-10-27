/** Logger for loaders, actions, and resource routes. */
type LogArgs = readonly unknown[];

const logger = {
	// Application errors - goes to stdout
	error: (...args: LogArgs) => {
		console.log('[ERROR]', ...args);
	},

	// Critical system errors - goes to stderr
	fatal: (...args: LogArgs) => {
		console.error('[FATAL]', ...args);
	},

	info: (...args: LogArgs) => {
		console.log('[INFO]', ...args);
	},

	debug: (...args: LogArgs) => {
		console.log('[DEBUG]', ...args);
	},

	warn: (...args: LogArgs) => {
		console.log('[WARN]', ...args);
	},
};

export default logger;

export { logger };
