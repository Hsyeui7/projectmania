import path from 'path';
import traverseBabel from '@babel/traverse';
import * as t from '@babel/types';
import {
	validateFilePath,
	findJSXElementAtPosition,
	generateSourceWithMap,
	VITE_PROJECT_ROOT,
} from '../../utils/ast-utils.js';
import { decodeHtmlEntities, cssPropToCamel, toJsxAttributeName } from '../utils/html-utils.js';

const WRITABLE_ATTRIBUTE_TARGETS = new Set(['src', 'href', 'to']);
// They describe the image a new src replaces; left in place, browsers keep rendering it.
const SRC_DEPENDENT_ATTRIBUTES = new Set(['srcSet', 'sizes']);
const JSX_STYLE_PROPERTY_PATTERN = /^[A-Za-z_$][\w$]*$/;

/**
 * Parses `filePath:line:column` edit IDs produced by the transform plugin.
 *
 * @param {string} editId
 * @returns {{ filePath: string, line: number, column: number }|null}
 */
function parseEditId(editId) {
	const segments = editId.split(':');
	if (segments.length < 3) return null;
	const column = parseInt(segments.at(-1), 10);
	const line = parseInt(segments.at(-2), 10);
	const filePath = segments.slice(0, -2).join(':');
	if (!filePath || isNaN(line) || isNaN(column)) return null;
	return { filePath, line, column };
}

/**
 * Converts an HTML `style="..."` string into a Babel JSX style object expression.
 *
 * @param {string} styleString
 * @returns {import('@babel/types').JSXExpressionContainer}
 */
function parseStyleString(styleString) {
	const decoded = decodeHtmlEntities(styleString);
	const properties = [];
	for (const declaration of decoded.split(';')) {
		const colonIndex = declaration.indexOf(':');
		if (colonIndex < 0) continue;
		const key = declaration.slice(0, colonIndex).trim();
		const value = declaration.slice(colonIndex + 1).trim();
		if (!key || !value) continue;
		properties.push(
			t.objectProperty(t.identifier(cssPropToCamel(key)), t.stringLiteral(value))
		);
	}
	return t.jsxExpressionContainer(t.objectExpression(properties));
}

/**
 * Parses HTML attribute string from saved innerHTML into JSX attribute nodes.
 * Skips `data-edit-*` attributes; maps names via {@link toJsxAttributeName}.
 *
 * @param {string} rawAttributes
 * @returns {import('@babel/types').JSXAttribute[]}
 */
function parseHtmlAttributesToJsx(rawAttributes) {
	if (!rawAttributes || !rawAttributes.trim()) return [];
	const attributes = [];
	const ATTRIBUTE_REGEX = /([\w-]+)\s*=\s*"([^"]*)"/g;
	let match;
	while ((match = ATTRIBUTE_REGEX.exec(rawAttributes)) !== null) {
		const [, rawName, value] = match;
		// data-edit-* are injected by the visual-editor transform; never write them to source
		if (rawName.startsWith('data-edit-')) continue;
		const name = toJsxAttributeName(rawName);
		if (name === 'style') {
			attributes.push(t.jsxAttribute(t.jsxIdentifier(name), parseStyleString(value)));
		} else {
			attributes.push(t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(decodeHtmlEntities(value))));
		}
	}
	return attributes;
}

/**
 * Rebuilds JSX children from saved innerHTML, reconstructing every tag structurally.
 * Rendered `<svg>` blocks are matched back, in order, to `iconQueue` (original icon nodes).
 *
 * @param {string} html
 * @param {import('@babel/types').JSXElement[]} iconQueue - consumed as rendered `<svg>` blocks are matched.
 * @returns {import('@babel/types').JSXChild[]}
 */
function buildChildrenFromText(html, iconQueue) {
	if (!html || html.trim() === '') return [];

	// Decode &lt;/&gt; back to literal tags (not &quot;, which TAG_REGEX relies on as a delimiter).
	html = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

	const TAG_REGEX = /<(\/?)(\w+)((?:\s+[\w-]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>/g;

	const result = [];
	const stack = [{ children: result }];
	let lastIndex = 0;
	/** Depth inside a rendered `<svg>` block being skipped because it was matched to a preserved icon. */
	let skippedSvgDepth = 0;
	let match;

	while ((match = TAG_REGEX.exec(html)) !== null) {
		const [full, closing, tagName, rawAttributes, selfClose] = match;
		const lower = tagName.toLowerCase();

		if (skippedSvgDepth > 0) {
			if (lower === 'svg' && selfClose !== '/') {
				skippedSvgDepth += closing === '/' ? -1 : 1;
			}
			lastIndex = match.index + full.length;
			continue;
		}

		if (match.index > lastIndex) {
			const text = html.slice(lastIndex, match.index);
			if (text) stack[stack.length - 1].children.push(t.jsxText(text));
		}
		lastIndex = match.index + full.length;

		if (closing === '/') {
			if (stack.length > 1 && stack[stack.length - 1].tag === lower) {
				const frame = stack.pop();
				const attributes = parseHtmlAttributesToJsx(frame.rawAttrs);
				stack[stack.length - 1].children.push(
					t.jsxElement(
						t.jsxOpeningElement(t.jsxIdentifier(frame.tag), attributes),
						t.jsxClosingElement(t.jsxIdentifier(frame.tag)),
						frame.children
					)
				);
			}
			continue;
		}

		if (lower === 'svg' && selfClose !== '/' && iconQueue.length > 0) {
			stack[stack.length - 1].children.push(iconQueue.shift());
			skippedSvgDepth = 1;
			continue;
		}

		// Void elements (img, br, ...) never get a closing tag in serialized HTML; others always do.
		const hasClosingTag = new RegExp(`</${lower}\\s*>`, 'i').test(html.slice(lastIndex));
		if (selfClose === '/' || !hasClosingTag) {
			const attributes = parseHtmlAttributesToJsx(rawAttributes);
			stack[stack.length - 1].children.push(
				t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier(lower), attributes, true), null, [], true)
			);
			continue;
		}

		stack.push({ tag: lower, children: [], rawAttrs: rawAttributes || '' });
	}

	if (lastIndex < html.length) {
		const text = html.slice(lastIndex);
		if (text) stack[stack.length - 1].children.push(t.jsxText(text));
	}

	// Auto-close any unclosed tags (defensive: malformed/truncated captured HTML).
	while (stack.length > 1) {
		const frame = stack.pop();
		const attributes = parseHtmlAttributesToJsx(frame.rawAttrs);
		stack[stack.length - 1].children.push(
			t.jsxElement(
				t.jsxOpeningElement(t.jsxIdentifier(frame.tag), attributes),
				t.jsxClosingElement(t.jsxIdentifier(frame.tag)),
				frame.children
			)
		);
	}

	return result;
}

/**
 * Merges or creates a JSX `style={{ ... }}` object on the opening element.
 * An empty-string value means the editor removed the inline property, so the
 * matching JSX style entry is dropped instead of written as `prop: ""`.
 *
 * @param {import('@babel/types').JSXOpeningElement} openingElement
 * @param {Record<string, string>} styleObject
 * @returns {boolean} Whether the style shape was safe to update.
 */
function setJsxStyleProperty(openingElement, styleObject) {
	const existing = openingElement.attributes.find(attribute =>
		t.isJSXAttribute(attribute) && attribute.name?.name === 'style'
	);
	if (existing && t.isJSXExpressionContainer(existing.value) && t.isObjectExpression(existing.value.expression)) {
		const properties = existing.value.expression.properties;
		for (const [key, value] of Object.entries(styleObject)) {
			const propertyIndex = properties.findIndex(property =>
				t.isObjectProperty(property) && t.isIdentifier(property.key) && property.key.name === key
			);
			if (!value) {
				if (propertyIndex !== -1) properties.splice(propertyIndex, 1);
			} else if (propertyIndex !== -1) {
				properties[propertyIndex].value = t.stringLiteral(value);
			} else {
				properties.push(t.objectProperty(t.identifier(key), t.stringLiteral(value)));
			}
		}
		return true;
	} else if (!existing) {
		const properties = Object.entries(styleObject)
			.filter(([, value]) => !!value)
			.map(([key, value]) => t.objectProperty(t.identifier(key), t.stringLiteral(value)));
		if (properties.length === 0) return true;
		openingElement.attributes.push(
			t.jsxAttribute(t.jsxIdentifier('style'), t.jsxExpressionContainer(t.objectExpression(properties)))
		);
		return true;
	}
	return false;
}

/**
 * Sets or removes a static JSX attribute.
 *
 * @param {import('@babel/types').JSXOpeningElement} openingElement
 * @param {string} attributeName
 * @param {string|null} value - `null` removes the attribute.
 * @returns {{ modified: true }|{ modified: false, error: string }}
 */
function setJsxAttribute(openingElement, attributeName, value) {
	const attributeIndex = openingElement.attributes.findIndex(attribute =>
		t.isJSXAttribute(attribute) && attribute.name?.name === attributeName
	);
	const existingAttribute = openingElement.attributes[attributeIndex];

	if (value === null) {
		if (attributeIndex !== -1) openingElement.attributes.splice(attributeIndex, 1);
		return { modified: true };
	}

	const newLiteral = t.stringLiteral(value);
	if (!existingAttribute) {
		openingElement.attributes.push(t.jsxAttribute(t.jsxIdentifier(attributeName), newLiteral));
		return { modified: true };
	}
	if (t.isStringLiteral(existingAttribute.value)) {
		existingAttribute.value = newLiteral;
		return { modified: true };
	}
	if (t.isJSXExpressionContainer(existingAttribute.value) && t.isStringLiteral(existingAttribute.value.expression)) {
		existingAttribute.value = newLiteral;
		return { modified: true };
	}
	return { modified: false, error: `Cannot write '${attributeName}' — source value is not a static string literal` };
}

/**
 * Parse + validate every draftKey; group valid edits by absolute file path;
 * push error entries for invalid ones.
 * @param {Record<string, object>} draft
 * @returns {{ editsByFile: Map<string, object[]>, results: object[] }}
 */
export function groupEditsByFile(draft) {
	const results = [];
	const editsByFile = new Map();

	for (const [draftKey, edit] of Object.entries(draft)) {
		let editId = draftKey;
		const atIndex = editId.indexOf('@');
		if (atIndex >= 0) editId = editId.slice(0, atIndex);

		const parsedId = parseEditId(editId);
		if (!parsedId) {
			results.push({ draftKey, success: false, error: 'Invalid editId format' });
			continue;
		}

		const validation = validateFilePath(parsedId.filePath);
		if (!validation.isValid) {
			results.push({ draftKey, success: false, error: validation.error });
			continue;
		}

		if (!editsByFile.has(validation.absolutePath)) {
			editsByFile.set(validation.absolutePath, []);
		}
		editsByFile.get(validation.absolutePath).push({ draftKey, editId, edit, parsedId });
	}

	return { editsByFile, results };
}

/**
 * Find the JSX opening element and apply its atomic content, attribute, and style changes.
 * @param {object} babelAst
 * @param {object} edit
 * @param {{ filePath: string, line: number, column: number }} parsedId
 * @returns {{ modified: true }|{ modified: false, error: string }}
 */
export function applyElementEdit(babelAst, edit, parsedId) {
	const targetNodePath = findJSXElementAtPosition(babelAst, parsedId.line, parsedId.column + 1);
	if (!targetNodePath) return { modified: false, error: 'Target node not found' };

	const targetOpeningElement = targetNodePath.node;
	const parentElementNode = targetNodePath.parentPath?.node;
	const changes = edit.instruction?.changes;
	if (!Array.isArray(changes) || changes.length === 0) {
		return { modified: false, error: 'Edit has no changes' };
	}

	const contentChanges = changes.filter(change => change.kind === 'content');
	const attributeChanges = changes.filter(change => change.kind === 'attribute');
	const styleChanges = changes.filter(change => change.kind === 'style');
	if (contentChanges.length + attributeChanges.length + styleChanges.length !== changes.length) {
		return { modified: false, error: 'Unsupported visual edit change kind' };
	}
	if (contentChanges.length > 1) {
		return { modified: false, error: 'Edit contains multiple content changes' };
	}
	if (changes.some(change =>
		(change.before !== null && typeof change.before !== 'string')
		|| (change.after !== null && typeof change.after !== 'string')
	)) {
		return { modified: false, error: 'Visual edit change values must be strings or null' };
	}
	if (contentChanges.some(change => change.target !== null)) {
		return { modified: false, error: 'Content changes must have a null target' };
	}
	if (contentChanges.length && (!parentElementNode || !t.isJSXElement(parentElementNode))) {
		return { modified: false, error: 'Could not apply content change to AST' };
	}
	if ([...attributeChanges, ...styleChanges].some(change => typeof change.target !== 'string' || !change.target)) {
		return { modified: false, error: 'Attribute and style changes require a target' };
	}
	if (attributeChanges.some(change => !WRITABLE_ATTRIBUTE_TARGETS.has(change.target))) {
		return { modified: false, error: 'Unsupported visual edit attribute target' };
	}
	if (styleChanges.some(change => !JSX_STYLE_PROPERTY_PATTERN.test(change.target))) {
		return { modified: false, error: 'Unsupported visual edit style target' };
	}
	if (styleChanges.length) {
		const styleAttribute = targetOpeningElement.attributes.find(attribute =>
			t.isJSXAttribute(attribute) && attribute.name?.name === 'style'
		);
		if (
			styleAttribute
			&& !(
				t.isJSXExpressionContainer(styleAttribute.value)
				&& t.isObjectExpression(styleAttribute.value.expression)
			)
		) {
			return { modified: false, error: 'Cannot write style — source value is not a static object literal' };
		}
	}

	// Validate every attribute before mutating the AST so a later unsupported
	// dynamic value cannot leave an earlier change partially applied.
	for (const change of attributeChanges) {
		const existingAttribute = targetOpeningElement.attributes.find(attribute =>
			t.isJSXAttribute(attribute) && attribute.name?.name === change.target
		);
		const isWritable = !existingAttribute
			|| t.isStringLiteral(existingAttribute.value)
			|| (
				t.isJSXExpressionContainer(existingAttribute.value)
				&& t.isStringLiteral(existingAttribute.value.expression)
			);
		if (!isWritable) {
			return {
				modified: false,
				error: `Cannot write '${change.target}' — source value is not a static string literal`,
			};
		}
	}

	for (const change of attributeChanges) {
		const result = setJsxAttribute(targetOpeningElement, change.target, change.after);
		if (!result.modified) return result;
	}
	if (attributeChanges.some(change => change.target === 'src')) {
		targetOpeningElement.attributes = targetOpeningElement.attributes.filter(attribute =>
			!(t.isJSXAttribute(attribute) && SRC_DEPENDENT_ATTRIBUTES.has(attribute.name?.name))
		);
	}

	if (contentChanges.length) {
		// Icon components can't be rebuilt from rendered HTML, so their original nodes pass through.
		const preservedIcons = parentElementNode.children.filter(child =>
			t.isJSXElement(child)
			&& child.openingElement.selfClosing
			&& child.openingElement.name?.name
			&& /^[A-Z]/.test(child.openingElement.name.name)
		);
		parentElementNode.children = buildChildrenFromText(contentChanges[0].after ?? '', preservedIcons);
	}

	if (styleChanges.length) {
		const style = Object.fromEntries(styleChanges.map(change => [change.target, change.after ?? '']));
		if (!setJsxStyleProperty(targetOpeningElement, style)) {
			return { modified: false, error: 'Cannot write style — source value is not a static object literal' };
		}
	}

	return { modified: true };
}

/**
 * Strip any lingering data-edit-* attributes from the AST and generate the new
 * source, returning the result entry for the API response.
 *
 * Must never write to disk: `/api/draft-save` is reachable unauthenticated from
 * the public preview origin, so persisting is the authenticated backend's job
 * via `POST /api/websites/:id/visual-edits`.
 *
 * @param {object} babelAst
 * @param {string} absoluteFilePath
 * @param {string} originalContent
 * @returns {{ filePath: string, newFileContent: string }}
 */
export function renderEditedSource(babelAst, absoluteFilePath, originalContent) {
	// Strip any data-edit-* attributes before generating source.
	const traverseFunction = traverseBabel.default || traverseBabel;
	traverseFunction(babelAst, {
		JSXOpeningElement(openingElementPath) {
			openingElementPath.node.attributes = openingElementPath.node.attributes.filter(attribute =>
				!(t.isJSXAttribute(attribute) && typeof attribute.name?.name === 'string'
					&& attribute.name.name.startsWith('data-edit-'))
			);
		},
	});
	const webRelativeFilePath = path.relative(VITE_PROJECT_ROOT, absoluteFilePath).split(path.sep).join('/');
	const output = generateSourceWithMap(babelAst, webRelativeFilePath, originalContent);
	return { filePath: webRelativeFilePath, newFileContent: output.code };
}
