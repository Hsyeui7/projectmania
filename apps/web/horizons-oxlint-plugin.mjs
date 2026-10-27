import unicodeEscapesPlugin from './eslint.unicode-escapes-plugin.mjs';

function reportRestrictedSyntax(context, message, node) {
	context.report({ node, message });
}

function createRestrictedSyntaxVisitors(context) {
	const visitors = {};
	for (const { selector, message } of context.options) {
		visitors[selector] = reportRestrictedSyntax.bind(undefined, context, message);
	}

	return visitors;
}

export default {
	meta: { name: 'horizons' },
	rules: {
		...unicodeEscapesPlugin.rules,
		'no-restricted-syntax': {
			meta: {
				type: 'suggestion',
				docs: {
					description: 'Disallow the syntax matched by the configured selectors, like ESLint\'s no-restricted-syntax',
				},
				schema: {
					type: 'array',
					items: {
						type: 'object',
						properties: { selector: { type: 'string' }, message: { type: 'string' } },
						required: ['selector', 'message'],
						additionalProperties: false,
					},
				},
			},
			create: createRestrictedSyntaxVisitors,
		},
	},
};
