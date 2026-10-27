import { IMPORTANT_STYLES } from '../constants/selectors.js';

const TEXT_CONTEXT_MAX_LENGTH = 500;
const OUTER_HTML_MAX_LENGTH = 5000;

/**
 * Decodes HTML entity-encoded characters back to their literal form.
 * @param {string} string
 * @returns {string}
 */
export function decodeHtmlEntities(string) {
	return string
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

/**
 * Converts a kebab-case CSS property name to camelCase.
 * @param {string} property
 * @returns {string}
 */
export function cssPropToCamel(property) {
	return property.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

const HTML_TO_JSX_ATTRIBUTE_RENAME_MAP = { class: 'className', for: 'htmlFor' };

/**
 * Converts an HTML attribute name to its JSX/React equivalent (renames `class`/`for`,
 * camelCases hyphenated names except `data-*`/`aria-*`, e.g. `stroke-width` -> `strokeWidth`).
 * @param {string} name
 * @returns {string}
 */
export function toJsxAttributeName(name) {
	if (Object.prototype.hasOwnProperty.call(HTML_TO_JSX_ATTRIBUTE_RENAME_MAP, name)) return HTML_TO_JSX_ATTRIBUTE_RENAME_MAP[name];
	if (name.startsWith('data-') || name.startsWith('aria-')) return name;
	return name.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
}

/**
 * Escapes HTML special characters in a plain string (used to build safe HTML markup).
 * @param {string} string
 * @returns {string}
 */
export function escapeHtml(string) {
	return string.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Strips inline HTML tags from text, converting <br> to newlines.
 * @param {string} text
 * @returns {string}
 */
export function stripInlineTags(text) {
	if (typeof text !== "string") return "";
	return text
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/?(strong|em|b|i|u|a|span)\b[^>]*>/gi, "");
}

/**
 * Returns the next node in document order within `root`, or null at the end.
 * @param {Node} node
 * @param {Node} root
 * @returns {Node|null}
 */
function nextNodeInFlow(node, root) {
	if (node.firstChild) return node.firstChild;
	let current = node;
	while (current && current !== root) {
		if (current.nextSibling) return current.nextSibling;
		current = current.parentNode;
	}
	return null;
}

/**
 * Whether a text node sits at the end of a line: nothing follows it, or the next
 * node in flow is a <br>. Only such trailing spaces get collapsed by the browser
 * on re-parse and need preserving — spaces between inline siblings (e.g. coloured
 * <span> words) must stay normal breaking spaces or the line can't wrap.
 * @param {Node} node
 * @param {Node} root
 * @returns {boolean}
 */
function isAtLineEnd(node, root) {
	const next = nextNodeInFlow(node, root);
	if (!next) return true;
	let candidate = next;
	while (candidate && candidate.nodeType === Node.ELEMENT_NODE) {
		if (candidate.tagName.toLowerCase() === 'br') return true;
		candidate = candidate.firstChild;
	}
	return false;
}

/**
 * Replaces line-end trailing keyboard spaces in text nodes with U+00A0 so innerHTML
 * round-trips preserve them (browsers drop trailing U+0020 on re-parse). Spaces
 * between inline siblings are left intact so the content can still wrap.
 * @param {Node} root
 */
function preserveTrailingSpacesInTextNodes(root) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const textNodes = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		textNodes.push(node);
	}
	for (const node of textNodes) {
		const text = node.nodeValue ?? '';
		if (!/ $/.test(text) || !isAtLineEnd(node, root)) continue;
		node.nodeValue = text.replace(/ +$/g, (spaces) => '\u00a0'.repeat(spaces.length));
	}
}

/**
 * Reads contenteditable markup from the live DOM after keyboard input, preserving
 * trailing spaces that `innerHTML` alone would drop on commit.
 * @param {HTMLElement} element
 * @returns {string}
 */
export function serializeContentEditableHtml(element) {
	if (!element) return '';
	const clone = element.cloneNode(true);
	preserveTrailingSpacesInTextNodes(clone);
	return normalizeContentEditableHtml(clone.innerHTML);
}

/**
 * Normalises contenteditable innerHTML into a canonical form by collapsing
 * Chrome's <div>-based line wrapping back into <br> separators.
 * Intentionally keeps `&nbsp;` entities so keyboard-typed trailing spaces persist.
 * @param {string} html
 * @returns {string}
 */
export function normalizeContentEditableHtml(html) {
	if (typeof html !== "string") return "";
	return html
		.replace(/<div><br\s*\/?><\/div>/gi, "<br>")
		.replace(/<br\s*\/?>\s*(?=<div>)/gi, "")
		.replace(/<div>/gi, "<br>")
		.replace(/<\/div>/gi, "")
		.replace(/^<br>/, "");
}

/**
 * Guards against "Failed to execute 'removeChild'" when innerHTML is set
 * while a browser async task still holds a reference to a child node.
 * @param {HTMLElement} element
 */
export function patchRemoveChild(element) {
	if (element.__removeChildPatched) return;
	const original = element.removeChild;
	element.removeChild = function (child) {
		if (child.parentNode !== this) return child;
		return original.call(this, child);
	};
	element.__removeChildPatched = true;
}

let reactDomMutationsPatched = false;

/**
 * Inline edits rewrite a target element's subtree via `innerHTML`, which orphans
 * the DOM nodes React still references in its fiber tree (including *nested*
 * nodes like <em>/<strong> inside an edited <h1>). On its next render React then
 * calls `removeChild`/`insertBefore` against nodes that are no longer where it
 * expects, throwing "The node to be removed is not a child of this node".
 *
 * Patching the per-element `removeChild` only covers the edit target, not its
 * descendants, so we guard the prototypes once instead: mismatched removals
 * become no-ops and mismatched insertions fall back to an append, letting React
 * reconcile to the correct state on the next render. Idempotent.
 */
export function patchReactDomMutations() {
	if (reactDomMutationsPatched) return;
	reactDomMutationsPatched = true;

	const originalRemoveChild = Node.prototype.removeChild;
	Node.prototype.removeChild = function (child) {
		if (child && child.parentNode !== this) return child;
		return originalRemoveChild.call(this, child);
	};

	const originalInsertBefore = Node.prototype.insertBefore;
	Node.prototype.insertBefore = function (newNode, referenceNode) {
		if (referenceNode && referenceNode.parentNode !== this) {
			return originalInsertBefore.call(this, newNode, null);
		}
		return originalInsertBefore.call(this, newNode, referenceNode);
	};
}

/**
 * Escapes raw HTML characters while preserving allowed inline tags
 * (strong, em, a, span, br, etc.) so user content is safe to inject into the DOM.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
	if (typeof text !== "string") return "";
	const normalized = normalizeContentEditableHtml(text);
	const preserved = [];
	let result = normalized.replace(/<(\/?)(?:strong|em|b|i|u|a|span|br)\b[^>]*\/?>/gi, (match) => {
		preserved.push(match);
		return `\x00ITAG${preserved.length - 1}\x00`;
	});
	result = result
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/{/g, "&#123;")
		.replace(/}/g, "&#125;");
	result = result.replace(/\x00ITAG(\d+)\x00/g, (_, index) => preserved[parseInt(index)]);
	return result;
}

/**
 * Builds a CSS selector path to uniquely identify the element.
 * Uses tag + classes + nth-of-type where IDs are unavailable.
 * @param {HTMLElement} element
 * @returns {string}
 */
export function buildCssSelector(element) {
	const path = [];
	let current = element;
	let depth = 0;
	const maxDepth = 20;

	while (current && current.nodeType === Node.ELEMENT_NODE && depth < maxDepth) {
		let selector = current.nodeName.toLowerCase();

		if (current.id) {
			selector += `#${current.id}`;
			path.unshift(selector);
			break;
		}

		if (current.className && typeof current.className === 'string') {
			const classes = current.className.trim().split(/\s+/).filter(c => c.length > 0);
			if (classes.length > 0) {
				selector += `.${classes.join('.')}`;
			}
		}

		if (current.parentElement) {
			const siblings = Array.from(current.parentElement.children);
			const sameTypeSiblings = siblings.filter(s => s.nodeName === current.nodeName);
			if (sameTypeSiblings.length > 1) {
				const index = sameTypeSiblings.indexOf(current) + 1;
				selector += `:nth-of-type(${index})`;
			}
		}

		path.unshift(selector);
		current = current.parentElement;
		depth++;
	}

	return path.join(' > ');
}

function getComputedStylesForElement(element) {
	const computedStyles = window.getComputedStyle(element);

	return Object.fromEntries(IMPORTANT_STYLES.map((style) => {
		const styleValue = computedStyles.getPropertyValue(style)?.trim();

		return styleValue && styleValue !== 'none' && styleValue !== 'normal'
			? [style, styleValue]
			: null;
	}).filter(Boolean));
}

/**
 * Extracts a rich DOM context payload for an element: selector, attributes,
 * computed styles, and truncated text content.
 * @param {HTMLElement} element
 * @returns {object|null}
 */
export function extractDOMContext(element) {
	if (!element) return null;

	const textContent = element.textContent?.trim();

	return {
		outerHTML: element.outerHTML.slice(0, OUTER_HTML_MAX_LENGTH),
		selector: buildCssSelector(element),
		attributes: (element.attributes && element.attributes.length > 0)
			? Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value]))
			: {},
		computedStyles: getComputedStylesForElement(element),
		textContent: (textContent && textContent.length > 0 && textContent.length < TEXT_CONTEXT_MAX_LENGTH)
			? textContent
			: null,
	};
}

/**
 * Walks the React fiber tree from a DOM node to find the source file path.
 * @param {HTMLElement} node
 * @returns {string|null}
 */
export function getFilePathFromNode(node) {
	const fiberKey = Object.keys(node).find(k => k.startsWith('__reactFiber'));
	if (!fiberKey) return null;

	let currentFiber = node[fiberKey];
	while (currentFiber) {
		const source = currentFiber._debugSource
			|| currentFiber.memoizedProps?.__source
			|| currentFiber.pendingProps?.__source;

		if (source?.fileName) return source.fileName;
		currentFiber = currentFiber.return;
	}

	return null;
}

/**
 * Strips the path prefix up to and including `public_html/`.
 * @param {string} filePath
 * @returns {string}
 */
export function stripFilePath(filePath) {
	if (!filePath) return filePath;
	const publicHtmlIndex = filePath.indexOf('public_html/');
	if (publicHtmlIndex !== -1) return filePath.substring(publicHtmlIndex + 'public_html/'.length);
	return filePath;
}
