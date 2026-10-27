import * as t from '@babel/types';

/**
 * For an editable `<a>` / `<Link>` / `<NavLink>`, returns the name of the URL
 * attribute (`href` or `to`) when it holds a static string literal.
 * Returns `null` for non-link tags or dynamic/expression URLs.
 * @param {import('@babel/types').JSXOpeningElement} openingNode
 * @returns {string|null}
 */
export function detectUrlAttribute(openingNode) {
	const tagName = openingNode.name?.name || openingNode.name?.property?.name || '';
	let attributeName = null;
	if (tagName === 'a') attributeName = 'href';
	else if (tagName === 'Link' || tagName === 'NavLink') attributeName = 'to';
	if (!attributeName) return null;

	const matchedAttribute = openingNode.attributes.find(attribute =>
		t.isJSXAttribute(attribute) && attribute.name?.name === attributeName
	);
	if (!matchedAttribute || !matchedAttribute.value) return null;

	if (t.isStringLiteral(matchedAttribute.value)) return attributeName;
	if (t.isJSXExpressionContainer(matchedAttribute.value) && t.isStringLiteral(matchedAttribute.value.expression)) return attributeName;

	return null;
}

/**
 * Pushes `data-edit-id` (and optionally `data-edit-url-attr`) onto the element.
 * @param {import('@babel/types').JSXOpeningElement} openingNode
 * @param {string} editId
 * @param {string|null} urlAttributeName
 */
export function attachEditAttributes(openingNode, editId, urlAttributeName) {
	openingNode.attributes.push(
		t.jsxAttribute(t.jsxIdentifier('data-edit-id'), t.stringLiteral(editId))
	);
	if (urlAttributeName) {
		openingNode.attributes.push(
			t.jsxAttribute(t.jsxIdentifier('data-edit-url-attr'), t.stringLiteral(urlAttributeName))
		);
	}
}

/**
 * Pushes only `data-edit-assisted-id` onto the element.
 * @param {import('@babel/types').JSXOpeningElement} openingNode
 * @param {string} editId
 */
export function attachAssistedEditId(openingNode, editId) {
	openingNode.attributes.push(
		t.jsxAttribute(t.jsxIdentifier('data-edit-assisted-id'), t.stringLiteral(editId))
	);
}
