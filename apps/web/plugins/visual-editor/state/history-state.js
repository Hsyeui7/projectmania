import { sanitizeText, patchRemoveChild } from "../utils/html-utils.js";
import { getComments } from "./annotation-state.js";
import { getEditId } from "../constants/selectors.js";

/** Maximum undo/redo entries; oldest entry is dropped when the log exceeds this. */
const MAX_HISTORY = 25;

/** Committed and redoable edit actions for the current session. */
const actionLog = [];

/** Index of the last committed entry in `actionLog`; -1 when nothing is committed. */
let actionPointer = -1;

/** Monotonic id assigned at the start of each inline edit session. */
let nextEditSessionId = 1;

/** @returns {number} A new session id for the next inline edit burst. */
export function beginEditSession() {
	return nextEditSessionId++;
}

/** @returns {number} index of the last committed entry; -1 if nothing committed */
export function getActionPointer() {
	return actionPointer;
}

/** @returns {number} total entries in the log, including undone future entries */
export function getActionLogLength() {
	return actionLog.length;
}

/** Wipes all undo/redo history (e.g. on discard or new session). */
export function clearHistory() {
	actionLog.length = 0;
	actionPointer = -1;
	nextEditSessionId = 1;
}

/**
 * Stable deduplication key for an action.
 * Direct edits target one source location (AST writer), so they key by editId only.
 * Assisted edits can target separate rendered instances of the same JSX expression,
 * so they also include the captured selector.
 * @param {{ editId: string, attribute?: string|null, isAssisted?: boolean, selectionMode?: object|null }} action
 * @returns {string}
 */
export function getActionKey(action) {
	const attributeSuffix = action.attribute ? `@${action.attribute}` : '';
	const selector = action.isAssisted ? action.selectionMode.selector : null;
	const instanceSuffix = selector ? `@selector:${selector}` : '';
	return `${action.editId}${attributeSuffix}${instanceSuffix}`;
}

/**
 * Resolves the DOM element for an action. Prefers the stored element reference
 * (survives HMR position shifts), falls back to querying by the current
 * data-edit-id attribute.
 * @param {object} action
 * @returns {HTMLElement|null}
 */
function resolveElement(action) {
	if (action.element?.isConnected) return action.element;
	return document.querySelector(`[data-edit-id="${action.editId}"]`)
		|| document.querySelector(`[data-edit-assisted-id="${action.editId}"]`);
}

/**
 * Finds the DOM element for an edit and writes a value to it (used by undo/redo).
 * @param {object} action - The history action entry (has element ref + editId).
 * @param {string} value
 */
function applyValueToElement(action, value) {
	const element = resolveElement(action);
	if (!element) return;

	if (action.attribute) {
		const domAttribute = action.attribute === 'to' ? 'href' : action.attribute;
		if (value === null) {
			element.removeAttribute(domAttribute);
		} else {
			element.setAttribute(domAttribute, value);
		}
		return;
	}

	if (element.tagName.toLowerCase() === "img") {
		element.setAttribute("src", value);
	} else {
		patchRemoveChild(element);
		element.innerHTML = value;
	}
}

/**
 * Applies element-level inline style props for undo/redo. Setting a prop to ''
 * removes the inline value so CSS-class styling takes over again.
 * @param {object} action - The history action entry.
 * @param {object|null} styleProperties - camelCase property → value (or '' to clear)
 */
function applyStyleToElement(action, styleProperties) {
	if (!styleProperties) return;
	const element = resolveElement(action);
	if (!element) return;
	for (const [key, value] of Object.entries(styleProperties)) {
		element.style[key] = value || '';
	}
}

/**
 * Records an edit, coalescing same-session changes to the same element into one
 * undo/redo step. Attribute edits (e.g. href) are keyed separately via {@link getActionKey}.
 *
 * @param {string} editId
 * @param {{ beforeContent: string|null, afterContent: string|null }} instruction - Internal undo/redo snapshot.
 * @param {object} [options]
 * @param {object|null} [options.style] - Net element-level style props applied.
 * @param {object|null} [options.oldStyle] - Previous inline values of those props ('' = unset).
 * @param {string|null} [options.attribute]
 * @param {HTMLElement|null} [options.element]
 * @param {number|null} [options.sessionId] - Inline edit session; coalesces only when equal.
 * @param {boolean} [options.isAssisted] - True when the source-writer can't safely apply this edit and the AI must.
 * @param {object|null} [options.selectionMode] - Rich DOM context captured before mutation (see `captureElementMetadata`).
 */
export function recordEdit(editId, instruction, { style = null, oldStyle = null, attribute = null, element = null, sessionId = null, isAssisted = false, selectionMode = null } = {}) {
	const composite = getActionKey({ editId, attribute, isAssisted, selectionMode });
	const lastForEdit = [...actionLog].slice(0, actionPointer + 1).findLast(action => getActionKey(action) === composite);
	if (lastForEdit && lastForEdit.instruction.afterContent === instruction.afterContent && !style) return;

	if (lastForEdit
		&& actionLog.lastIndexOf(lastForEdit) === actionPointer
		&& lastForEdit.sessionId === sessionId) {
		lastForEdit.instruction = { ...lastForEdit.instruction, afterContent: instruction.afterContent };
		if (style) {
			lastForEdit.style = { ...lastForEdit.style, ...style };
			lastForEdit.oldStyle = { ...oldStyle, ...lastForEdit.oldStyle };
		}
		if (element) lastForEdit.element = element;
		return;
	}

	actionLog.length = actionPointer + 1;
	actionLog.push({ editId, instruction, style, oldStyle, attribute, element, sessionId, isAssisted, selectionMode });

	if (actionLog.length > MAX_HISTORY) {
		actionLog.shift();
	}

	actionPointer = actionLog.length - 1;
}

/**
 * Re-applies every committed edit's content/attribute/style to its element,
 * for entries whose stored element reference went stale (a route change or
 * React re-render replaced it with a freshly-mounted, un-edited node).
 */
export function reapplyCommittedEdits() {
	for (let index = 0; index <= actionPointer; index++) {
		const action = actionLog[index];
		if (action.element?.isConnected) continue;

		const element = resolveElement(action);
		if (!element) continue;

		action.element = element;
		applyValueToElement(action, action.instruction.afterContent);
		if (action.style) applyStyleToElement(action, action.style);
	}
}

/**
 * Reverts the most recent committed edit (content and element-level styles)
 * and moves the pointer back.
 * @returns {{ editId: string, instruction: { beforeContent: string, afterContent: string } }|null}
 */
export function undo() {
	if (actionPointer < 0) return null;
	const action = actionLog[actionPointer];
	applyValueToElement(action, action.instruction.beforeContent);
	if (action.style) {
		const revert = {};
		for (const key of Object.keys(action.style)) {
			revert[key] = action.oldStyle?.[key] ?? '';
		}
		applyStyleToElement(action, revert);
	}
	actionPointer--;
	return action;
}

/**
 * Re-applies the next undone edit (content and element-level styles) and
 * advances the pointer.
 * @returns {{ editId: string, instruction: { beforeContent: string, afterContent: string } }|null}
 */
export function redo() {
	if (actionPointer >= actionLog.length - 1) return null;
	actionPointer++;
	const action = actionLog[actionPointer];
	applyValueToElement(action, action.instruction.afterContent);
	applyStyleToElement(action, action.style);
	return action;
}

/**
 * Aggregates the committed log into one draft per target: the first entry for a key
 * captures the original instruction/style, later entries update `afterContent`/style.
 * @returns {Map<string, { editId: string, attribute: string|null, instruction: { beforeContent: string, afterContent: string }, originalStyle: Record<string, string>, currentStyle: Record<string, string>, isAssisted: boolean, selectionMode: object|null }>}
 */
function collectEditDrafts() {
	const draftsByKey = new Map();
	for (let index = 0; index <= actionPointer; index++) {
		const action = actionLog[index];
		const key = getActionKey(action);
		let draft = draftsByKey.get(key);
		if (!draft) {
			draft = {
				editId: action.editId,
				attribute: action.attribute ?? null,
				instruction: {
					beforeContent: action.instruction.beforeContent,
					afterContent: action.instruction.afterContent,
				},
				originalStyle: {},
				currentStyle: {},
				isAssisted: action.isAssisted ?? false,
				selectionMode: action.selectionMode ?? null,
			};
			draftsByKey.set(key, draft);
		}
		draft.instruction.afterContent = action.instruction.afterContent;
		for (const [property, value] of Object.entries(action.style ?? {})) {
			if (!(property in draft.originalStyle)) {
				draft.originalStyle[property] = action.oldStyle?.[property] ?? '';
			}
			draft.currentStyle[property] = value;
		}
	}
	return draftsByKey;
}

/**
 * Collapses the committed log into one net edit per target, shaped like the wire
 * `VisualEditItem`, keyed separately for source persistence and history aggregation.
 * Content, attribute, and individual style-property changes are emitted atomically
 * so downstream consumers do not have to infer what a before/after pair represents.
 * @returns {Record<string, { editId: string, instruction: { changes: Array<{ kind: string, target: string|null, before: string|null, after: string|null }> }, isAssisted: boolean, selectionMode: object|null }>}
 */
export function getCurrentEdits() {
	const edits = {};
	for (const [key, draft] of collectEditDrafts()) {
		const changes = [];
		const beforeContent = draft.attribute
			? draft.instruction.beforeContent ?? null
			: sanitizeText(draft.instruction.beforeContent);
		const afterContent = draft.attribute
			? draft.instruction.afterContent ?? null
			: sanitizeText(draft.instruction.afterContent);

		if (beforeContent !== afterContent) {
			changes.push({
				kind: draft.attribute ? 'attribute' : 'content',
				target: draft.attribute,
				before: beforeContent,
				after: afterContent,
			});
		}

		for (const property of Object.keys(draft.currentStyle)) {
			if ((draft.currentStyle[property] ?? '') !== (draft.originalStyle[property] ?? '')) {
				changes.push({
					kind: 'style',
					target: property,
					before: draft.originalStyle[property] || null,
					after: draft.currentStyle[property] || null,
				});
			}
		}

		if (!changes.length) continue;

		const edit = {
			editId: draft.editId,
			instruction: { changes },
			isAssisted: !!draft.isAssisted,
			selectionMode: draft.selectionMode,
		};
		edits[key] = edit;
	}
	return edits;
}

/**
 * Categorizes the current, uncommitted edit set — used to report which kinds of
 * changes a save actually carries, as opposed to which edit surfaces were merely
 * opened during the session (a text/image edit entered and then reverted leaves
 * no trace here).
 * @param {ReturnType<typeof getCurrentEdits>} edits
 * @param {ReturnType<typeof getComments>} annotations
 * @returns {string[]} distinct categories: "text" | "image" | "annotation"
 */
function getEditTypes(edits, annotations) {
	const editTypes = new Set();
	for (const edit of Object.values(edits)) {
		const isImageEdit = edit.instruction.changes.some(change => change.kind === 'attribute' && change.target === 'src');
		editTypes.add(isImageEdit ? 'image' : 'text');
	}
	if (annotations.length) editTypes.add('annotation');
	return [...editTypes];
}

/**
 * Undo/redo availability plus the count of distinct elements that differ from their original,
 * including elements that only carry an annotation (no history edit).
 * @returns {{ canUndo: boolean, canRedo: boolean, editedElementsCount: number, editTypes: string[] }}
 */
export function getEditState() {
	const edits = getCurrentEdits();
	const annotations = getComments();
	
	const changedElementIds = new Set(
		Object.values(edits).map(edit => getActionKey({ ...edit, attribute: null })),
	);

	annotations.forEach((annotation, annotationIndex) => {
		if (!annotation.elements.length) {
			changedElementIds.add(`annotation-${annotationIndex}`);
			return;
		}

		annotation.elements.forEach((element, elementIndex) => {
			changedElementIds.add(getEditId(element) || `annotation-${annotationIndex}-${elementIndex}`);
		});
	});

	return {
		canUndo: actionPointer >= 0,
		canRedo: actionPointer < actionLog.length - 1,
		editedElementsCount: changedElementIds.size,
		editTypes: getEditTypes(edits, annotations),
	};
}

/**
 * Serializes the full undo/redo stack for persistence across reloads.
 * Strips non-serializable DOM element refs.
 * @returns {{ actionLog: object[], actionPointer: number, nextEditSessionId: number }}
 */
export function exportDraftSnapshot() {
	return {
		actionLog: actionLog.map(({ element: _element, ...action }) => ({
			...action,
			instruction: { ...action.instruction },
			style: action.style ? { ...action.style } : null,
			oldStyle: action.oldStyle ? { ...action.oldStyle } : null,
			selectionMode: action.selectionMode ? structuredClone(action.selectionMode) : null,
		})),
		actionPointer,
		nextEditSessionId,
	};
}

/**
 * Rebuilds the undo/redo stack from a persisted snapshot and re-applies committed
 * edits to the current DOM. Skips actions whose elements cannot be resolved.
 * @param {{ actionLog?: object[], actionPointer?: number, nextEditSessionId?: number }|null|undefined} snapshot
 * @returns {{ restoredCount: number, skippedCount: number }}
 */
export function importDraftSnapshot(snapshot) {
	clearHistory();

	if (!snapshot || !Array.isArray(snapshot.actionLog)) {
		return { restoredCount: 0, skippedCount: 0 };
	}

	let restoredCount = 0;
	let skippedCount = 0;

	for (const action of snapshot.actionLog) {
		if (!action?.editId || !action?.instruction) {
			skippedCount++;
			continue;
		}
		actionLog.push({
			editId: action.editId,
			instruction: {
				beforeContent: action.instruction.beforeContent ?? null,
				afterContent: action.instruction.afterContent ?? null,
			},
			style: action.style ?? null,
			oldStyle: action.oldStyle ?? null,
			attribute: action.attribute ?? null,
			element: null,
			sessionId: action.sessionId ?? null,
			isAssisted: !!action.isAssisted,
			selectionMode: action.selectionMode ?? null,
		});
		restoredCount++;
	}

	const maxPointer = actionLog.length - 1;
	const requestedPointer = typeof snapshot.actionPointer === 'number' ? snapshot.actionPointer : maxPointer;
	actionPointer = Math.min(Math.max(requestedPointer, -1), maxPointer);
	nextEditSessionId = typeof snapshot.nextEditSessionId === 'number' && snapshot.nextEditSessionId > 0
		? snapshot.nextEditSessionId
		: 1;

	reapplyCommittedEdits();

	for (let index = 0; index <= actionPointer; index++) {
		if (!actionLog[index].element) {
			skippedCount++;
		}
	}

	return { restoredCount, skippedCount };
}
