/** Shared DOM-context capture for the unified visual-edit contract. */

const IMPORTANT_STYLES = [
	'display',
	'position',
	'flex-direction',
	'justify-content',
	'align-items',
	'width',
	'height',
	'padding',
	'margin',
	'border',
	'background-color',
	'color',
	'font-size',
	'font-weight',
	'font-family',
	'border-radius',
	'box-shadow',
	'gap',
	'grid-template-columns',
];

const TEXT_CONTEXT_MAX_LENGTH = 500;

/** Backend DTO caps `selectionMode.selector` at this length; must match `src/constants/message.ts`. */
const SELECTOR_MAX_LENGTH = 1_000;

/** Keeps generated context well below the backend's 50,000-character `outerHTML` cap. */
const DOM_CONTEXT_MAX_LENGTH = 5_000;
const DOM_CONTEXT_MAX_DEPTH = 3;
const DOM_CONTEXT_MAX_CHILD_ELEMENTS = 5;
const DOM_CONTEXT_EDGE_CHILD_ELEMENTS = 2;
const DOM_CONTEXT_MAX_TEXT_LENGTH = 300;
const DOM_CONTEXT_TEXT_EDGE_LENGTH = 140;
const DOM_CONTEXT_MAX_ATTRIBUTE_LENGTH = 300;
const DOM_CONTEXT_ATTRIBUTE_EDGE_LENGTH = 140;

const OMITTED_ELEMENT_NAMES = new Set([
	'base',
	'head',
	'link',
	'meta',
	'noscript',
	'script',
	'style',
	'template',
]);

function contextAttributeEntries(element) {
	if (!element.attributes) {
		return [];
	}

	return Array.from(element.attributes).flatMap((attribute) => {
		const name = attribute.name.toLowerCase();
		const value = attribute.value;
		if (
			name.startsWith('data-edit-')
			|| name === 'data-selection-mode-enabled'
			|| name.startsWith('on')
			|| name === 'srcdoc'
			|| value.trimStart().toLowerCase().startsWith('data:')
		) {
			return [];
		}

		if (value.length <= DOM_CONTEXT_MAX_ATTRIBUTE_LENGTH) {
			return [[attribute.name, value]];
		}

		const omittedLength = value.length - (DOM_CONTEXT_ATTRIBUTE_EDGE_LENGTH * 2);
		return [[
			attribute.name,
			`${value.slice(0, DOM_CONTEXT_ATTRIBUTE_EDGE_LENGTH)}[${omittedLength} chars omitted]${value.slice(-DOM_CONTEXT_ATTRIBUTE_EDGE_LENGTH)}`,
		]];
	});
}

function cloneElementShell(element) {
	const clone = element.cloneNode(false);
	Array.from(clone.attributes ?? []).forEach(attribute => clone.removeAttribute(attribute.name));
	contextAttributeEntries(element).forEach(([name, value]) => clone.setAttribute(name, value));
	return clone;
}

function appendTextContext(parent, value) {
	if (!value) {
		return;
	}
	if (value.length <= DOM_CONTEXT_MAX_TEXT_LENGTH) {
		parent.appendChild(parent.ownerDocument.createTextNode(value));
		return;
	}

	const omittedLength = value.length - (DOM_CONTEXT_TEXT_EDGE_LENGTH * 2);
	parent.appendChild(parent.ownerDocument.createTextNode(value.slice(0, DOM_CONTEXT_TEXT_EDGE_LENGTH)));
	parent.appendChild(parent.ownerDocument.createComment(`${omittedLength} text chars omitted`));
	parent.appendChild(parent.ownerDocument.createTextNode(value.slice(-DOM_CONTEXT_TEXT_EDGE_LENGTH)));
}

function contextElementChildren(element) {
	return Array.from(element.children)
		.filter(child => !OMITTED_ELEMENT_NAMES.has(child.tagName.toLowerCase()));
}

function collectVisibleText(element) {
	if (element.tagName.toLowerCase() === 'svg') {
		return Array.from(element.children)
			.filter(child => ['title', 'desc'].includes(child.tagName.toLowerCase()))
			.map(child => child.textContent ?? '')
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	return Array.from(element.childNodes).map((child) => {
		if (child.nodeType === Node.TEXT_NODE) {
			return child.textContent ?? '';
		}
		if (child.nodeType !== Node.ELEMENT_NODE) {
			return '';
		}
		if (OMITTED_ELEMENT_NAMES.has(child.tagName.toLowerCase())) {
			return '';
		}
		return collectVisibleText(child);
	})
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function appendSvgContext(source, clone) {
	Array.from(source.children)
		.filter(child => ['title', 'desc'].includes(child.tagName.toLowerCase()))
		.forEach((child) => {
			const semanticClone = cloneElementShell(child);
			appendTextContext(semanticClone, collectVisibleText(child));
			clone.appendChild(semanticClone);
		});
	clone.appendChild(clone.ownerDocument.createComment('SVG content omitted'));
}

function cloneElementContext(element, depth) {
	const tagName = element.tagName.toLowerCase();
	if (OMITTED_ELEMENT_NAMES.has(tagName)) {
		return null;
	}

	const clone = cloneElementShell(element);
	if (tagName === 'svg') {
		appendSvgContext(element, clone);
		return clone;
	}
	if (tagName === 'canvas') {
		appendTextContext(clone, collectVisibleText(element).trim());
		clone.appendChild(clone.ownerDocument.createComment('canvas bitmap not captured'));
		return clone;
	}

	const elementChildren = contextElementChildren(element);
	if (depth >= DOM_CONTEXT_MAX_DEPTH && elementChildren.length > 0) {
		appendTextContext(clone, collectVisibleText(element).trim());
		clone.appendChild(clone.ownerDocument.createComment('descendants omitted'));
		return clone;
	}

	const keptChildren = elementChildren.length > DOM_CONTEXT_MAX_CHILD_ELEMENTS
		? new Set([
				...elementChildren.slice(0, DOM_CONTEXT_EDGE_CHILD_ELEMENTS),
				...elementChildren.slice(-DOM_CONTEXT_EDGE_CHILD_ELEMENTS),
			])
		: new Set(elementChildren);
	const omittedChildrenCount = elementChildren.length - keptChildren.size;
	let omissionMarkerAdded = false;

	Array.from(element.childNodes).forEach((child) => {
		if (child.nodeType === Node.TEXT_NODE) {
			appendTextContext(clone, child.textContent ?? '');
			return;
		}
		if (child.nodeType !== Node.ELEMENT_NODE || OMITTED_ELEMENT_NAMES.has(child.tagName.toLowerCase())) {
			return;
		}
		if (!keptChildren.has(child)) {
			if (!omissionMarkerAdded) {
				clone.appendChild(clone.ownerDocument.createComment(`${omittedChildrenCount} elements omitted`));
				omissionMarkerAdded = true;
			}
			return;
		}

		const childClone = cloneElementContext(child, depth + 1);
		if (childClone) {
			clone.appendChild(childClone);
		}
	});

	return clone;
}

/**
 * Builds compact, valid HTML context while retaining the selected element's
 * identifying structure and visible text.
 * @param {HTMLElement} element
 * @returns {string}
 */
export function serializeElementContext(element) {
	const clone = cloneElementContext(element, 0);
	if (!clone) {
		return '<!-- context omitted -->';
	}

	const serialized = clone.outerHTML;
	if (serialized.length <= DOM_CONTEXT_MAX_LENGTH) {
		return serialized;
	}

	const fallback = cloneElementShell(element);
	fallback.appendChild(fallback.ownerDocument.createComment('context omitted: size limit'));
	while (fallback.outerHTML.length > DOM_CONTEXT_MAX_LENGTH && fallback.attributes.length > 0) {
		fallback.removeAttribute(fallback.attributes.item(fallback.attributes.length - 1).name);
	}
	return fallback.outerHTML;
}

/**
 * Builds a CSS selector path to uniquely identify the element.
 * Uses tag + classes + nth-of-type where IDs are unavailable. Ancestors with many
 * utility classes (e.g. Tailwind) can make the full path exceed the backend's length
 * cap, so distant ancestors are dropped first since the leaf end is more identifying.
 * @param {HTMLElement} element
 * @returns {string} CSS selector path, truncated to fit {@link SELECTOR_MAX_LENGTH}
 */
export function buildCssSelector(element) {
	const path = [];
	let current = element;
	let depth = 0;
	const maxDepth = 20; // Prevent infinite loops

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

	while (path.length > 1 && path.join(' > ').length > SELECTOR_MAX_LENGTH) {
		path.shift();
	}

	return path.join(' > ').slice(0, SELECTOR_MAX_LENGTH);
}

function getComputedStylesSnapshot(element) {
	const computedStyles = window.getComputedStyle(element);

	return Object.fromEntries(IMPORTANT_STYLES.map((style) => {
		const styleValue = computedStyles.getPropertyValue(style)?.trim();

		return styleValue && styleValue !== 'none' && styleValue !== 'normal'
			? [style, styleValue]
			: null;
	})
	.filter(Boolean));
}

/**
 * Strips everything up to and including `public_html/` so the path matches
 * the workspace-relative form the backend/AI expect.
 * @param {string|null} filePath
 * @returns {string|null}
 */
function stripPublicHtmlPrefix(filePath) {
	if (!filePath) {
		return filePath;
	}

	const publicHtmlIndex = filePath.indexOf('public_html/');
	if (publicHtmlIndex !== -1) {
		return filePath.substring(publicHtmlIndex + 'public_html/'.length);
	}

	return filePath;
}

/**
 * Extracts source location from a `filePath:line:column` edit id (the
 * format the visual-editor transform writes into `data-edit-id` /
 * `data-edit-assisted-id` — see `transform/inject-attributes.js` and the
 * matching parser in `server/source-writer.js`).
 * @param {string} editId
 * @returns {{filePath: string, line: number, column: number}|null}
 */
export function sourceLocationFromEditId(editId) {
	const segments = editId.split(':');
	if (segments.length < 3) {
		return null;
	}
	const line = Number(segments.at(-2));
	const column = Number(segments.at(-1));
	const filePath = segments.slice(0, -2).join(':');
	if (!filePath || !Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) {
		return null;
	}
	return { filePath, line, column };
}

/**
 * Walks the React Fiber tree to find the source file path of an element with
 * no visual-editor edit-id attribute (plain selection-mode clicks).
 * @param {HTMLElement} element
 * @returns {string|null}
 */
function filePathFromReactFiber(element) {
	const fiberKey = Object.keys(element).find(key => key.startsWith('__reactFiber'));
	if (!fiberKey) {
		return null;
	}

	let currentFiber = element[fiberKey];
	while (currentFiber) {
		const source = currentFiber._debugSource
			|| currentFiber.memoizedProps?.__source
			|| currentFiber.pendingProps?.__source;

		if (source?.fileName) {
			return source.fileName;
		}

		currentFiber = currentFiber.return;
	}

	return null;
}

/**
 * Resolves the source file path for `element`. Prefers the visual editor's
 * own `data-edit-id` / `data-edit-assisted-id` attribute — already
 * `filePath:line:col`, no extra work — falling back to walking the React
 * Fiber tree for elements the editor hasn't tagged (plain selection-mode
 * clicks).
 * @param {HTMLElement} element
 * @returns {string} File path, or "" if it could not be resolved.
 */
export function resolveElementFilePath(element) {
	const editId = element.getAttribute?.('data-edit-id') || element.getAttribute?.('data-edit-assisted-id');
	if (editId) {
		const sourceLocation = sourceLocationFromEditId(editId);
		if (sourceLocation) {
			return stripPublicHtmlPrefix(sourceLocation.filePath) ?? '';
		}
	}

	return stripPublicHtmlPrefix(filePathFromReactFiber(element)) ?? '';
}

/**
 * Captures the full `selectionMode` context for `element`: source file
 * path and optional source position, outer HTML, a CSS selector path, its
 * attributes, a snapshot of the important computed styles, and trimmed text
 * content (when short enough to be useful). Shared by selection mode and the
 * visual editor so both emit the exact same shape the backend validates and
 * the AI consumes.
 * @param {HTMLElement} element
 * @returns {{filePath: string, sourceLine?: number, sourceColumn?: number, outerHTML: string, selector: string, attributes: Record<string, string>, computedStyles: Record<string, string>, textContent: string|null}|null}
 */
export function captureElementMetadata(element) {
	if (!element) {
		return null;
	}

	const textContent = element.textContent?.trim();
	const editId = element.getAttribute?.('data-edit-id') || element.getAttribute?.('data-edit-assisted-id');
	const sourceLocation = editId ? sourceLocationFromEditId(editId) : null;

	return {
		filePath: resolveElementFilePath(element),
		...(sourceLocation && {
			sourceLine: sourceLocation.line,
			sourceColumn: sourceLocation.column,
		}),
		outerHTML: serializeElementContext(element),
		selector: buildCssSelector(element),
		attributes: Object.fromEntries(contextAttributeEntries(element)),
		computedStyles: getComputedStylesSnapshot(element),
		textContent: (textContent && textContent.length > 0 && textContent.length < TEXT_CONTEXT_MAX_LENGTH)
			? textContent
			: null,
	};
}
