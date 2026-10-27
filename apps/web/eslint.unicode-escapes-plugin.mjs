const CODE_LIKE_ELEMENTS = new Set(['code', 'pre', 'kbd', 'samp']);
const UNICODE_ESCAPE_PATTERN = /\\u(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]{1,6}\})/g;

function isInsideCodeLikeElement(node) {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (parent.type !== 'JSXElement') {
			continue;
		}

		const name = parent.openingElement.name;
		if (name.type === 'JSXIdentifier' && CODE_LIKE_ELEMENTS.has(name.name)) {
			return true;
		}
	}

	return false;
}

export default {
	rules: {
		'no-unicode-escapes-in-jsx': {
			meta: {
				type: 'problem',
				docs: {
					description: 'Warn when Unicode escapes in JSX text or quoted attributes would be shown verbatim to website visitors instead of rendering the intended character',
				},
				schema: [],
				messages: {
					found: 'Literal Unicode escape "{{escape}}" in JSX text or a quoted attribute may be displayed verbatim to users. Replace only the escape in place with the intended literal character (for example, use "ç", not "\\u00e7"). Do not move the text into variables, objects, or JSX expressions, and do not wrap the escape in JSX braces ({}).',
				},
			},
			create(context) {
				function check(node) {
					if (isInsideCodeLikeElement(node)) {
						return;
					}

					const text = context.sourceCode.getText(node);
					for (const match of text.matchAll(UNICODE_ESCAPE_PATTERN)) {
						const startIndex = node.range[0] + match.index;
						context.report({
							node,
							loc: {
								start: context.sourceCode.getLocFromIndex(startIndex),
								end: context.sourceCode.getLocFromIndex(startIndex + match[0].length),
							},
							messageId: 'found',
							data: { escape: match[0] },
						});
					}
				}

				return {
					JSXText: check,
					JSXAttribute(node) {
						if (node.value?.type === 'Literal') {
							check(node.value);
						}
					},
				};
			},
		},
	},
};
