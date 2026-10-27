import * as t from '@babel/types';
import { ELEMENT_TYPE_MAP } from '../constants/selectors.js';

export const EDITABLE_HTML_TAGS = ["a", "Link", "button", "Button", "p", "span", "time", "h1", "h2", "h3", "h4", "h5", "h6", "label", "Label", "img"];

export const INLINE_EDIT_HTML_TAGS = ["br", "strong", "em", "b", "i", "u", "span", "a"];

/**
 * @param {import('@babel/types').JSXOpeningElement} openingElementNode
 * @param {string[]} editableTagsList
 * @returns {boolean}
 */
export function checkTagNameEditable(openingElementNode, editableTagsList) {
	if (!openingElementNode || !openingElementNode.name) return false;
	const nameNode = openingElementNode.name;

	if (nameNode.type === 'JSXIdentifier' && editableTagsList.includes(nameNode.name)) {
		return true;
	}

	if (nameNode.type === 'JSXMemberExpression' && nameNode.property && nameNode.property.type === 'JSXIdentifier' && editableTagsList.includes(nameNode.property.name)) {
		return true;
	}

	return false;
}

/**
 * @param {import('@babel/types').JSXOpeningElement} openingNode
 * @returns {{ isValid: boolean, reason: string|null }}
 */
export function validateImageSrc(openingNode) {
	if (!openingNode || !openingNode.name || (openingNode.name.name !== 'img' && openingNode.name.property?.name !== 'img')) {
		return { isValid: true, reason: null };
	}

	const hasPropsSpread = openingNode.attributes.some(attribute =>
		t.isJSXSpreadAttribute(attribute) &&
		attribute.argument &&
		t.isIdentifier(attribute.argument) &&
		attribute.argument.name === 'props'
	);

	if (hasPropsSpread) return { isValid: false, reason: 'props-spread' };

	const sourceAttribute = openingNode.attributes.find(attribute =>
		t.isJSXAttribute(attribute) && attribute.name && attribute.name.name === 'src'
	);

	if (!sourceAttribute) return { isValid: false, reason: 'missing-src' };
	if (!t.isStringLiteral(sourceAttribute.value)) return { isValid: false, reason: 'dynamic-src' };
	if (!sourceAttribute.value.value || sourceAttribute.value.value.trim() === '') return { isValid: false, reason: 'empty-src' };

	return { isValid: true, reason: null };
}

// `children` and capitalised identifiers hold rendered nodes, not text, so an
// element whose only content is one of those is a layout slot rather than a target.
function isNodeSlotExpression(expression) {
	if (t.isIdentifier(expression)) return expression.name === 'children' || /^[A-Z]/.test(expression.name);
	return t.isMemberExpression(expression) && expression.property?.name === 'children';
}

function isLikelyTextExpression(expression) {
	if (isNodeSlotExpression(expression)) return false;
	// A ternary or `&&` still renders text through whichever branch wins. Without
	// this, `{ready ? `${n} entries` : 'Loading'}` reads as an empty element and
	// the span is skipped entirely instead of being marked assisted.
	if (t.isConditionalExpression(expression)) {
		return isLikelyTextExpression(expression.consequent) || isLikelyTextExpression(expression.alternate);
	}
	if (t.isLogicalExpression(expression)) {
		return isLikelyTextExpression(expression.right);
	}
	return t.isIdentifier(expression)
		|| t.isMemberExpression(expression)
		|| t.isStringLiteral(expression)
		|| t.isNumericLiteral(expression)
		|| t.isTemplateLiteral(expression);
}

/**
 * True when an element has direct text children worth editing
 * @param {import('@babel/types').JSXElement} elementNode
 * @returns {boolean}
 */
export function hasMeaningfulTextContent(elementNode) {
	if (!t.isJSXElement(elementNode) || !elementNode.children?.length) return false;
	for (const child of elementNode.children) {
		if (t.isJSXText(child) && child.value.trim().length > 0) return true;
		if (t.isJSXExpressionContainer(child)
			&& !t.isJSXEmptyExpression(child.expression)
			&& isLikelyTextExpression(child.expression)) return true;
	}
	return false;
}

/**
 * Like {@link hasMeaningfulTextContent} but walks the full subtree.
 * Used to distinguish decorative inline children (color swatches, icons)
 * from ones that carry actual text.
 */
function subtreeHasText(elementNode) {
	if (!t.isJSXElement(elementNode)) return false;
	for (const child of elementNode.children ?? []) {
		if (t.isJSXText(child) && child.value.trim().length > 0) return true;
		if (t.isJSXExpressionContainer(child)
			&& !t.isJSXEmptyExpression(child.expression)
			&& isLikelyTextExpression(child.expression)) return true;
		if (t.isJSXElement(child) && subtreeHasText(child)) return true;
	}
	return false;
}

/**
 * Returns true if the element should receive an assisted-edit id due to spread
 * props or dynamic children that contain text. Icon-only buttons are excluded.
 * @param {import('@babel/types').JSXElement} elementNode
 * @param {import('@babel/types').JSXOpeningElement} openingNode
 * @returns {boolean}
 */
export function shouldDisableDueToChildren(elementNode, openingNode) {
	if (!t.isJSXElement(elementNode) || !elementNode.children) return false;

	const hasPropsSpread = openingNode.attributes.some(attribute =>
		t.isJSXSpreadAttribute(attribute)
		&& attribute.argument
		&& t.isIdentifier(attribute.argument)
		&& attribute.argument.name === 'props'
	);
	if (hasPropsSpread) return true;

	const hasDynamicChild = elementNode.children.some(child => t.isJSXExpressionContainer(child));
	if (hasDynamicChild) {
		const hasStaticText = elementNode.children.some(
			child => t.isJSXText(child) && child.value.trim().length > 0
		);
		if (hasStaticText) return true;

		const hasTextLikeExpression = elementNode.children.some(child =>
			t.isJSXExpressionContainer(child)
			&& !t.isJSXEmptyExpression(child.expression)
			&& isLikelyTextExpression(child.expression)
		);
		if (hasTextLikeExpression) return true;
	}

	return false;
}

/**
 * Analyses child composition to decide whether the element can be edited.
 * @param {import('@babel/types').JSXElement} elementNode
 * @param {import('@babel/types').JSXOpeningElement} openingNode
 * @returns {'skip'|'disabled'|'allow'}
 */
export function evalChildComposition(elementNode, openingNode) {
	if (!t.isJSXElement(elementNode)) return 'allow';
	if (!elementNode.children?.length) {
		const name = openingNode?.name?.name || openingNode?.name?.property?.name || '';
		return name === 'img' ? 'allow' : 'skip';
	}

	let hasTextContent = false;
	let hasNonEditableJsxChild = false;
	let hasNonSelfClosingChild = false;
	let hasInlineTagChild = false;
	let hasIdIneligibleInlineChild = false;

	for (const child of elementNode.children) {
		if (t.isJSXText(child)) {
			if (child.value.trim().length > 0) hasTextContent = true;
			continue;
		}
		if (t.isJSXExpressionContainer(child)) {
			if (!t.isJSXEmptyExpression(child.expression) && isLikelyTextExpression(child.expression)) {
				hasTextContent = true;
			}
			continue;
		}
		if (t.isJSXElement(child)) {
			const childNode = child.openingElement;
			if (childNode.selfClosing) {
				const childName = childNode.name?.name || '';
				if (!/^[A-Z]/.test(childName) && !checkTagNameEditable(childNode, EDITABLE_HTML_TAGS) && !INLINE_EDIT_HTML_TAGS.includes(childName)) {
					hasNonEditableJsxChild = true;
				}
				continue;
			}
			const childTagName = child.openingElement.name?.name;
			if (INLINE_EDIT_HTML_TAGS.includes(childTagName)) {
				if (!subtreeHasText(child)) {
					hasNonEditableJsxChild = true;
					continue;
				}
				hasInlineTagChild = true;
				// `strong`/`em`/… are inline-editable inside a parent but cannot
				// receive their own edit id (Condition 2 returns early). Only
				// skip the parent when every inline child could own an id.
				if (!EDITABLE_HTML_TAGS.includes(childTagName)) {
					hasIdIneligibleInlineChild = true;
				}
				continue;
			}
			hasNonSelfClosingChild = true;
			if (!checkTagNameEditable(childNode, EDITABLE_HTML_TAGS)) {
				hasNonEditableJsxChild = true;
			}
		}
	}

	if (!hasTextContent && !hasNonSelfClosingChild && !hasInlineTagChild) return 'skip';
	if (hasNonEditableJsxChild) {
		if (!hasTextContent && !hasInlineTagChild) return 'skip';
		return 'disabled';
	}
	if (hasNonSelfClosingChild && !hasTextContent && !hasInlineTagChild) {
		if (openingNode && checkTagNameEditable(openingNode, EDITABLE_HTML_TAGS)) return 'allow';
		return 'skip';
	}
	// Layout wrappers that only nest id-eligible inline tags (span/a) skip so
	// the child receives the id. Keep 'allow' when an inline child cannot own
	// an id (`<p><strong>text</strong></p>`), or when the parent is itself an
	// editable tag (h1, p, a, button, …) that should own the edit target.
	if (!hasTextContent && hasInlineTagChild && !hasIdIneligibleInlineChild) {
		const parentName = openingNode?.name?.name || openingNode?.name?.property?.name || '';
		const isFormattingWrapper = INLINE_EDIT_HTML_TAGS.includes(parentName) && parentName !== 'a';
		if (openingNode && checkTagNameEditable(openingNode, EDITABLE_HTML_TAGS)
			&& !isFormattingWrapper) return 'allow';
		return 'skip';
	}
	return 'allow';
}

/**
 * Recursively checks whether an element or any of its descendants contain
 * dynamic content, spread props, or conditional expressions that a direct
 * inline edit would silently overwrite. When true the element must be routed
 * through AI-assisted editing instead.
 * @param {import('@babel/types').JSXElement} elementNode
 * @returns {boolean}
 */
export function subtreeRequiresAssistance(elementNode) {
	if (!t.isJSXElement(elementNode)) return false;

	const opening = elementNode.openingElement;
	if (opening.attributes.some(attribute => t.isJSXSpreadAttribute(attribute))) {
		return true;
	}

	for (const child of elementNode.children ?? []) {
		if (t.isJSXExpressionContainer(child) && !t.isJSXEmptyExpression(child.expression)) {
			return true;
		}

		if (t.isJSXElement(child) && subtreeRequiresAssistance(child)) {
			return true;
		}
	}

	return false;
}

/**
 * Returns true if an ancestor JSXElement already received a target attribute.
 * @param {import('@babel/traverse').NodePath<import('@babel/types').JSXOpeningElement>} openingPath
 * @returns {boolean}
 */
export function hasEditableAncestor(openingPath) {
	const selfElementPath = openingPath.parentPath;
	if (!selfElementPath?.isJSXElement()) return false;

	let ancestorJsxElementPath = selfElementPath.findParent(path => path.isJSXElement());
	while (ancestorJsxElementPath) {
		const ancestorOpening = ancestorJsxElementPath.node.openingElement;
		if (ancestorOpening.attributes.some(attribute =>
			t.isJSXAttribute(attribute) && (attribute.name?.name === 'data-edit-id' || attribute.name?.name === 'data-edit-assisted-id')
		)) {
			return true;
		}
		ancestorJsxElementPath = ancestorJsxElementPath.findParent(path => path.isJSXElement());
	}
	return false;
}

/**
 * Maps a JSX opening element tag name to a semantic edit type.
 * @param {import('@babel/types').JSXOpeningElement} openingNode
 * @returns {string|null}
 */
export function getElementTypeFromNode(openingNode) {
	if (!openingNode || !openingNode.name) return null;
	const name = openingNode.name?.name || openingNode.name?.property?.name || '';
	if (!name) return null;

	for (const [type, tags] of Object.entries(ELEMENT_TYPE_MAP)) {
		if (tags.includes(name)) return type;
	}

	return null;
}
