/** Minimum computed font-weight treated as bold (matches toolbar + toggle-off). */
const BOLD_WEIGHT_THRESHOLD = 600;

/**
 * @param {Range} range
 * @returns {Text[]}
 */
export function getTextNodesInRange(range) {
	const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
		? range.commonAncestorContainer.parentElement
		: range.commonAncestorContainer;
	const nodes = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) {
		if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
	}
	return nodes;
}

function elementFromNode(node) {
	if (!node) return null;
	return node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
}

function walkAncestors(element, container, predicate) {
	let current = element;
	while (current && current !== container.parentElement) {
		if (predicate(current)) return true;
		current = current.parentElement;
	}
	return false;
}

/** @returns {boolean} True when `node` sits inside bold markup or computed weight. */
export function isNodeBold(node, container) {
	if (parseInt(getComputedStyle(container).fontWeight) >= BOLD_WEIGHT_THRESHOLD) return true;
	const element = elementFromNode(node);
	if (!element) return false;
	return walkAncestors(element, container, (current) => {
		// `<strong>`/`<b>` apply `font-weight: bolder`, which resolves to only 400
		// when the parent is a light weight (e.g. Tailwind `font-light`, 300), so a
		// computed-weight check alone misses them. Treat the tags as bold directly.
		const tag = current.tagName?.toLowerCase();
		if (tag === 'strong' || tag === 'b') return true;
		return parseInt(getComputedStyle(current).fontWeight) >= BOLD_WEIGHT_THRESHOLD;
	});
}

/** @returns {boolean} True when `node` sits inside italic markup or computed style. */
export function isNodeItalic(node, container) {
	if (getComputedStyle(container).fontStyle === 'italic') return true;
	const element = elementFromNode(node);
	if (!element) return false;
	return walkAncestors(element, container, (current) => getComputedStyle(current).fontStyle === 'italic');
}

/** @returns {boolean} True when `node` sits inside underlined markup or decoration. */
export function isNodeUnderlined(node, container) {
	const containerTextDecorationLine = getComputedStyle(container).textDecorationLine || getComputedStyle(container).textDecoration || '';
	if (containerTextDecorationLine.includes('underline')) return true;
	const element = elementFromNode(node);
	if (!element) return false;
	return walkAncestors(element, container, (current) => {
		const textDecorationLine = getComputedStyle(current).textDecorationLine || getComputedStyle(current).textDecoration || '';
		return textDecorationLine.includes('underline');
	});
}

/**
 * Resolves coexisting bold / italic / underline at a single DOM position.
 * Each flag is independent — e.g. `<em><u><strong>t</strong></u></em>` is all three.
 * @param {Node} node
 * @param {HTMLElement} container
 * @returns {{ isBold: boolean, isItalic: boolean, isUnderline: boolean }}
 */
export function resolveInlineStylesAtNode(node, container) {
	return {
		isBold: isNodeBold(node, container),
		isItalic: isNodeItalic(node, container),
		isUnderline: isNodeUnderlined(node, container),
	};
}

/**
 * Resolves toolbar toggle state for the current selection.
 * Collapsed → styles at caret. Range → active only when every covered text node has the style.
 * @param {Range} range
 * @param {HTMLElement} container
 * @returns {{ isBold: boolean, isItalic: boolean, isUnderline: boolean }}
 */
export function resolveInlineStylesAtRange(range, container) {
	if (range.collapsed) {
		return resolveInlineStylesAtNode(range.startContainer, container);
	}
	const nodes = getTextNodesInRange(range);
	if (nodes.length === 0) {
		return resolveInlineStylesAtNode(range.startContainer, container);
	}
	return {
		isBold: nodes.every((node) => isNodeBold(node, container)),
		isItalic: nodes.every((node) => isNodeItalic(node, container)),
		isUnderline: nodes.every((node) => isNodeUnderlined(node, container)),
	};
}
