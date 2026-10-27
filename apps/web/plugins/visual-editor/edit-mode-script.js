import { startInlineEdit, commitCurrentEdit, placeCursorAtPoint } from "./ui/inline-edit/edit-action.js";
import { getEditing } from "./state/editing-state.js";
import { getElementType, isInFixedContext, isolateEditorUiEvents, getOpenModals } from "./utils/dom-utils.js";
import { postToParent, ALLOWED_PARENT_ORIGINS } from "./utils/parent-frame.js";
import { ParentMessage, ChildMessage } from "./constants/messages.js";
import { isEditModeEnabled, isInsideEditorUi, ACTIONABLE_SELECTOR, EDIT_TARGET_SELECTOR, getEditId } from "./constants/selectors.js";
import { recordEdit, reapplyCommittedEdits } from "./state/history-state.js";
import { applySessionUndo, applySessionRedo } from "./utils/session-history-command.js";
import { handleDraftSave, handleDraftDiscard, discardAllEdits } from "./api/draft.js";
import { applyDraftSnapshot, notifyDraftStateChanged } from "./api/draft-snapshot.js";
import { patchReactDomMutations } from "./utils/html-utils.js";
import { showTypeTooltip, hideTypeTooltip } from "./ui/overlays/type-tooltip.js";
import { openOrCreateAnnotation, getAnnotationPanelEl, hideAnnotationPanel, openPanelForEdit, addPendingAttachments } from "./ui/annotation-panel/panel.js";
import { clearAllAnnotationMarkers, refreshAnnotationMarkers } from "./ui/annotation-panel/annotation-markers.js";
import { setEditorTranslations, setComments, getPendingElements } from "./state/annotation-state.js";
import { captureElementMetadata } from "./utils/selection-mode-metadata.js";
import { hideTextFormatToolbar } from "./ui/text-format/toolbar/toolbar.js";
import { hideAllPanels } from "./state/panel-state.js";
import { lockHoverOutline, unlockHoverOutline } from "./ui/overlays/hover-outline.js";
import {
	DRAG_SELECT_THRESHOLD, MAX_SELECTED_ELEMENTS,
	ANNOTATION_PANEL_WIDTH, ANNOTATION_PANEL_ESTIMATED_HEIGHT, PANEL_GAP,
} from "./constants/layout.js";
import {
	getSelectedElements, setSelectedElements, clearSelectedElements,
	getDragStartX, getDragStartY, setDragStart, clearDragStart,
	getIsDragging, setIsDragging,
	getHadDrag, setHadDrag,
	isDragPending, resetMultiSelectState, toggleSelectedElement, orderSelection,
	pruneDetachedSelection,
} from "./state/multi-select-state.js";
import {
	getSelectionRect, collectSelection, NO_TEXT_SELECT_CLASS,
	showSelectionRect, hideSelectionRect, destroySelectionRect,
} from "./ui/overlays/selection-rect.js";

let globalClickHandler = null;

/** Tracks the element behind the parent image picker (back-compat `edit-save` flow). */
let currentImageEdit = null;

let lastCursorClientX = 0;
let lastCursorClientY = 0;
let typeTooltipAnimationFrameId = null;
/** True right after a mousedown until the next genuine mousemove, so a drag doesn't drag the tooltip too. */
let suppressTypeTooltipUntilMove = false;
/** Caches the last raw `elementFromPoint` hit to skip the pointer-events workaround below when unchanged. */
let lastRawHitTestElement = null;
let lastResolvedTypeTooltipTarget = null;

/* ------------------------------------------------------------------ *
 * Editable target lookup
 * ------------------------------------------------------------------ */

function findEditableElementAtPoint(event) {
	const direct = event.target.closest(EDIT_TARGET_SELECTOR);
	if (direct) return direct;

	if (isInFixedContext(event.target)) return null;

	const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
	const found = elementsAtPoint.find(
		(element) => element !== event.target && (element.hasAttribute("data-edit-id") || element.hasAttribute("data-edit-assisted-id"))
	);
	return found || null;
}

/* ------------------------------------------------------------------ *
 * Image edit (parent picker) — kept as the existing message contract
 * ------------------------------------------------------------------ */

function startImageEdit(targetElement, editId) {
	currentImageEdit = { editId, targetElement };
	lockHoverOutline(targetElement);
	postToParent(ParentMessage.IMAGE_EDIT_ENTER, {
		currentText: targetElement.getAttribute('src') || '',
		elementType: 'img',
		isDirectlyEditable: targetElement.hasAttribute('data-edit-id'),
	});
}

/** Clears the in-progress image edit and drops its locked outline. */
function clearImageEdit() {
	if (!currentImageEdit) return;
	currentImageEdit = null;
	unlockHoverOutline();
}

/**
 * Dismisses an active image selection and tells the parent to close the image
 * picker popup (e.g. when the user clicks away to another element or empty space).
 */
function cancelImageEdit() {
	if (!currentImageEdit) return;
	clearImageEdit();
	postToParent(ParentMessage.EDIT_CANCEL, {});
}

/**
 * The parent image picker drives image replacement via `edit-save`. The change
 * is applied to the live DOM and recorded in history; it is written to source
 * only on an explicit draft save.
 */
function handleImageEditSave(newText) {
	if (!currentImageEdit) return;
	const { editId, targetElement } = currentImageEdit;
	const beforeContent = targetElement.getAttribute('src');
	const afterContent = newText ?? "";
	const isAssisted = targetElement.hasAttribute('data-edit-assisted-id');
	const selectionMode = captureElementMetadata(targetElement);
	// Matches the source writer, which drops both with the old src.
	targetElement.removeAttribute('srcset');
	targetElement.removeAttribute('sizes');
	targetElement.setAttribute('src', afterContent);
	recordEdit(editId, { beforeContent, afterContent }, {
		attribute: 'src',
		element: targetElement,
		isAssisted,
		selectionMode,
	});
	clearImageEdit();
	notifyDraftStateChanged();
}

/* ------------------------------------------------------------------ *
 * Group selection (drag band + shift+click)
 * ------------------------------------------------------------------ */

let dragPreviewFrameId = null;

/** Drops the group and the outlines marking it. */
function clearMultiSelection() {
	clearSelectedElements();
	unlockHoverOutline();
}

/** Element under the cursor that a group may target, or null for empty space. */
function resolveGroupTarget(event) {
	const rawTarget = document.elementFromPoint(event.clientX, event.clientY);
	if (!rawTarget || isPageRoot(rawTarget) || isInsideEditorUi(rawTarget)) return null;

	const resolved = resolveHoverTarget(rawTarget, event.clientX, event.clientY);
	return resolved && !isPageRoot(resolved) ? resolved : null;
}

/** True when the click landed on a member of the group (or inside one). */
function isGroupMember(group, target) {
	return !!target && group.some(member => member === target || member.contains(target));
}

/**
 * A drag takes over the whole surface, so every other floating affordance —
 * toolbar dropdowns, the text toolbar, an open annotation panel, the image
 * picker — gets out of the way before the band is drawn.
 */
function beginDragSelect(event) {
	setIsDragging(true);
	hideAllPanels();
	hideTextFormatToolbar();
	// A shift+drag extends the group, so the panel must not take it down with it.
	hideAnnotationPanel({ restoreFocus: false, keepSelection: event.shiftKey });
	if (getEditing()) commitCurrentEdit();
	hideTypeTooltipImmediately();
	cancelImageEdit();
	if (!event.shiftKey) clearMultiSelection();
}

/** Ends the gesture and tears the band down, whether it completed or was abandoned. */
function endDragSelect() {
	clearDragStart();
	setIsDragging(false);
	if (dragPreviewFrameId !== null) {
		cancelAnimationFrame(dragPreviewFrameId);
		dragPreviewFrameId = null;
	}
	hideSelectionRect();
	document.body.classList.remove(NO_TEXT_SELECT_CLASS);
}

function cancelDragSelect() {
	if (!isDragPending()) return;
	endDragSelect();
	clearMultiSelection();
}

function handleVisibilityChange() {
	if (document.visibilityState === "hidden" && getEditing()) {
		commitCurrentEdit();
	}
}

function handleSelectMouseDown(event) {
	setHadDrag(false);
	if (!isEditModeEnabled()) return;
	if (event.button !== 0 || isInsideEditorUi(event.target)) return;
	// Text selection inside the active inline edit stays native.
	if (getEditing()?.targetElement?.contains(event.target)) return;

	// Suppress all native pointerdown side-effects (focus, text selection, form
	// validation) so the host app never reacts to clicks during edit mode.
	event.preventDefault();

	document.body.classList.add(NO_TEXT_SELECT_CLASS);
	if (event.shiftKey) {
		window.getSelection()?.removeAllRanges();
	}

	setDragStart(event.clientX, event.clientY);
}

/**
 * Recomputes the previewed group at most once per frame — `collectSelection`
 * walks the page and measures every candidate, which is far too heavy to run on
 * every mousemove of a drag.
 */
function scheduleDragPreview(clientX, clientY, additive) {
	if (dragPreviewFrameId !== null) return;
	dragPreviewFrameId = requestAnimationFrame(() => {
		dragPreviewFrameId = null;
		if (!getIsDragging()) return;

		const preview = collectSelection(getSelectionRect(getDragStartX(), getDragStartY(), clientX, clientY));
		lockHoverOutline(orderSelection(additive ? [...getSelectedElements(), ...preview] : preview));
	});
}

function handleSelectMouseMove(event) {
	if (!isDragPending()) return;

	const startX = getDragStartX();
	const startY = getDragStartY();

	if (!getIsDragging()) {
		const movedFarEnough = Math.abs(event.clientX - startX) > DRAG_SELECT_THRESHOLD
			|| Math.abs(event.clientY - startY) > DRAG_SELECT_THRESHOLD;
		if (!movedFarEnough) return;
		beginDragSelect(event);
	}

	event.preventDefault();
	showSelectionRect(startX, startY, event.clientX, event.clientY);
	scheduleDragPreview(event.clientX, event.clientY, event.shiftKey);
}

function handleSelectMouseUp(event) {
	if (!isDragPending()) return;

	const startX = getDragStartX();
	const startY = getDragStartY();
	const wasDragging = getIsDragging();
	endDragSelect();
	if (!wasDragging) return;

	event.preventDefault();
	event.stopPropagation();
	// The browser still delivers a click for this gesture; handleClick drops it.
	setHadDrag(true);

	const picked = collectSelection(getSelectionRect(startX, startY, event.clientX, event.clientY));
	const group = orderSelection(event.shiftKey ? [...getSelectedElements(), ...picked] : picked)
		.slice(0, MAX_SELECTED_ELEMENTS);
	setSelectedElements(group);

	if (!group.length) {
		clearMultiSelection();
		return;
	}
	openOrCreateAnnotation(group, event.clientX, event.clientY);
}

/** Escape drops a group that no panel is holding; an open panel owns the key itself. */
function handleSelectionKeydown(event) {
	if (event.key !== 'Escape' || !getSelectedElements().length) return;
	if (getAnnotationPanelEl()?.classList.contains('active')) return;
	clearMultiSelection();
}

/* ------------------------------------------------------------------ *
 * Click routing
 * ------------------------------------------------------------------ */

function handleClick(event) {
	if (!isEditModeEnabled()) return;

	if (event.target.closest?.("a[href]")) {
		event.preventDefault();
	}

	if (isInsideEditorUi(event.target)) {
		cancelImageEdit();
		return;
	}

	// Action: drop the click a completed drag leaves behind.
	if (getHadDrag()) {
		setHadDrag(false);
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		return;
	}

	// Action: shift+click adds or removes one element from the group. The panel
	// stays shut — it opens on the following plain click on a member.
	if (event.shiftKey) {
		const target = resolveGroupTarget(event);
		if (!target) return;

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		hideTypeTooltipImmediately();
		cancelImageEdit();
		if (getEditing()) {
			hideTextFormatToolbar();
			commitCurrentEdit();
		}
		hideAnnotationPanel({ restoreFocus: false, keepSelection: true });

		// At the cap, removing still works but adding is ignored — silently
		// dropping some other member to make room would be worse.
		const selected = getSelectedElements();
		if (selected.includes(target) || selected.length < MAX_SELECTED_ELEMENTS) {
			toggleSelectedElement(target);
		}
		lockHoverOutline(getSelectedElements());
		return;
	}

	// Action: open the group's panel when the click lands on one of its members;
	// anything else drops the group and falls through to single-element routing.
	const group = getSelectedElements();
	if (group.length) {
		if (isGroupMember(group, resolveGroupTarget(event))) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			hideTypeTooltipImmediately();
			cancelImageEdit();
			if (getEditing()) commitCurrentEdit();
			hideAnnotationPanel({ restoreFocus: false, keepSelection: true });

			openOrCreateAnnotation(group, event.clientX, event.clientY);
			return;
		}
		clearMultiSelection();
	}

	// Action: dismiss annotation panel on outside click.
	if (getAnnotationPanelEl()?.classList.contains('active')) {
		hideAnnotationPanel();
		hideTextFormatToolbar();
		if (getEditing()) {
			commitCurrentEdit();
		}
		if (!findEditableElementAtPoint(event)) {
			return;
		}
	}

	const editing = getEditing();

	// Action: place cursor inside the active contenteditable on click.
	if (editing?.targetElement?.hasAttribute("contenteditable") && editing.targetElement.contains(event.target)) {
		event.stopPropagation();
		event.stopImmediatePropagation();
		const link = event.target.closest?.("a");
		if (link && editing.targetElement.contains(link)) {
			event.preventDefault();
			if (event.detail <= 1) {
				placeCursorAtPoint(event.clientX, event.clientY, editing.targetElement);
			}
		}
		return;
	}

	// Action: start inline edit or image edit on an editable element.
	const editable = findEditableElementAtPoint(event);

	if (editable) {
		if (editing && editing.targetElement === editable) {
			commitCurrentEdit();
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		const editId = getEditId(editable);
		if (!editId) return;

		hideTypeTooltipImmediately();

		if (editable?.tagName?.toLowerCase() === 'img') {
			if (editing) commitCurrentEdit();
			startImageEdit(editable, editId);
			return;
		}

		if (editing) {
			commitCurrentEdit();
		}
		clearImageEdit();
		startInlineEdit(editable, editId, editable.innerHTML || "");
		return;
	}

	// Action: commit any active inline edit and stop.
	if (editing) {
		commitCurrentEdit();
		return;
	}

	// Action: open annotation panel for non-editable elements (blocks, icon-only buttons/links, etc.).
	const rawTarget = document.elementFromPoint(event.clientX, event.clientY);
	if (rawTarget && !isPageRoot(rawTarget)) {
		const hoverTarget = resolveHoverTarget(rawTarget, event.clientX, event.clientY);
		const hoverType = hoverTarget && getElementType(hoverTarget);
		if (hoverTarget && !isPageRoot(hoverTarget) && (hoverType === 'block' || hoverType === 'button')) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
			hideTypeTooltipImmediately();
			cancelImageEdit();

			postToParent(ParentMessage.ANNOTATION_PANEL_OPENED, { elementType: hoverTarget.tagName.toLowerCase() });
			openOrCreateAnnotation(hoverTarget, event.clientX, event.clientY);
			return;
		}
	}

	// Action: close the image picker when clicking empty space.
	cancelImageEdit();

	if (event.target.closest("a[href], button, [role='button'], [type='submit']")) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}
}

/* ------------------------------------------------------------------ *
 * Hover type tooltip (element type near the cursor)
 * ------------------------------------------------------------------ */

/** Finds the deepest actionable descendant of `container` still under `(clientX, clientY)`, or `container` itself. */
function resolveActionableDescendantAtPoint(container, clientX, clientY) {
	let deepest = container;
	for (const candidate of container.querySelectorAll(ACTIONABLE_SELECTOR)) {
		const bounds = candidate.getBoundingClientRect();
		if (clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) {
			deepest = candidate;
		}
	}
	return deepest;
}

/** Hides the type tooltip and drops any frame scheduled to redisplay it. */
function hideTypeTooltipImmediately() {
	if (typeTooltipAnimationFrameId !== null) {
		cancelAnimationFrame(typeTooltipAnimationFrameId);
		typeTooltipAnimationFrameId = null;
	}
	hideTypeTooltip();
}

/** Resolves the element under the cursor to highlight: 
 * an editable or `<svg>` ancestor wins, else the raw target. */
function resolveHoverTarget(rawTarget, clientX, clientY) {
	const editableAncestor = rawTarget.closest(EDIT_TARGET_SELECTOR);
	if (editableAncestor) return resolveActionableDescendantAtPoint(editableAncestor, clientX, clientY);

	const svgAncestor = rawTarget.closest('svg');
	if (svgAncestor) return svgAncestor;

	return resolveActionableDescendantAtPoint(rawTarget, clientX, clientY);
}

/** True for the page's own root containers, which are too broad to be a meaningful hover target. */
function isPageRoot(element) {
	return element === document.body || element === document.documentElement || element.id === 'root';
}

function updateTypeTooltip() {
	// A drag keeps firing mousemove, which would otherwise clear the
	// suppress-until-move flag and flash the tooltip over the band.
	if (!isEditModeEnabled() || suppressTypeTooltipUntilMove || getIsDragging()) {
		hideTypeTooltip();
		return;
	}

	const rawTarget = document.elementFromPoint(lastCursorClientX, lastCursorClientY);
	if (!rawTarget || isInsideEditorUi(rawTarget) || isPageRoot(rawTarget)) {
		hideTypeTooltip();
		return;
	}

	const editing = getEditing();
	if (editing?.targetElement && (editing.targetElement === rawTarget || editing.targetElement.contains(rawTarget))) {
		hideTypeTooltip();
		return;
	}

	if (rawTarget !== lastRawHitTestElement) {
		lastRawHitTestElement = rawTarget;
		lastResolvedTypeTooltipTarget = resolveHoverTarget(rawTarget, lastCursorClientX, lastCursorClientY);
	}

	showTypeTooltip(lastResolvedTypeTooltipTarget, lastCursorClientX, lastCursorClientY);
}

/** Throttles type-tooltip recomputation to at most once per animation frame. */
function scheduleTypeTooltipUpdate() {
	if (typeTooltipAnimationFrameId !== null) return;
	typeTooltipAnimationFrameId = requestAnimationFrame(() => {
		typeTooltipAnimationFrameId = null;
		updateTypeTooltip();
	});
}

function handleTypeTooltipMouseMove(event) {
	lastCursorClientX = event.clientX;
	lastCursorClientY = event.clientY;
	suppressTypeTooltipUntilMove = false;
	scheduleTypeTooltipUpdate();
}

/** Wheel-scroll fires no `mousemove`, so recompute from the last known cursor position. */
function handleTypeTooltipScroll() {
	if (!isEditModeEnabled()) return;
	scheduleTypeTooltipUpdate();
}

/** Suppresses the tooltip for the duration of a text-selection or element drag. */
function handleTypeTooltipMouseDown() {
	suppressTypeTooltipUntilMove = true;
	hideTypeTooltipImmediately();
}

/* ------------------------------------------------------------------ *
 * Annotation ↔ DOM sync (client-side route changes, re-renders)
 * ------------------------------------------------------------------ */

let annotationDomObserver = null;
let annotationDomSyncFrameId = null;

/**
 * Re-anchors markers to their (re-mounted) elements and hides the ones whose
 * element left the page, so a comment made on one route stays on that route.
 * Also re-applies unsaved edits to any element a route change or React
 * re-render replaced, so they don't visually revert to the unedited source.
 */
function syncAnnotationsWithDom() {
	annotationDomSyncFrameId = null;
	reapplyCommittedEdits();
	refreshAnnotationMarkers();

	// A group only ever spans one page: navigating away unmounts its members, and
	// an outline can't be drawn for an element that is no longer there.
	if (pruneDetachedSelection()) {
		const group = getSelectedElements();
		if (group.length) lockHoverOutline(group);
		else clearMultiSelection();
	}

	const pendingElements = getPendingElements();
	if (pendingElements.length
		&& pendingElements.every(element => !element.isConnected)
		&& getAnnotationPanelEl()?.classList.contains('active')) {
		hideAnnotationPanel({ restoreFocus: false });
		hideTextFormatToolbar();
	}
}

/** Throttles the annotation sync to at most once per animation frame. */
function scheduleAnnotationDomSync() {
	if (annotationDomSyncFrameId !== null) return;
	annotationDomSyncFrameId = requestAnimationFrame(syncAnnotationsWithDom);
}

/* ------------------------------------------------------------------ *
 * Undo / redo keyboard shortcuts
 * ------------------------------------------------------------------ */

/** True for native text-editing surfaces where the browser should own undo. */
function isNativeEditingContext(target) {
	if (!target) return false;
	const tag = target.tagName?.toLowerCase();
	return tag === "input" || tag === "textarea" || !!target.isContentEditable;
}

function handleHistoryKeydown(event) {
	if (!isEditModeEnabled()) return;
	if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;

	// While an inline edit is active, let the browser handle native text undo
	// inside the contenteditable region instead of stepping the edit history.
	if (getEditing()?.targetElement?.hasAttribute("contenteditable") || isNativeEditingContext(event.target)) {
		return;
	}

	event.preventDefault();
	if (event.shiftKey) {
		applySessionRedo();
	} else {
		applySessionUndo();
	}
}

/* Keeps host-page modals open and host-page key handlers quiet in edit mode. */

function handleModalPointerDownGuard(event) {
	if (isInsideEditorUi(event.target)) return;

	const openModals = getOpenModals();
	if (!openModals.length) return;
	if (openModals.some((modal) => modal.contains(event.target))) return;

	event.stopImmediatePropagation();
}

/**
 * Registered on window capture after the editor's own key handlers: `stopPropagation`
 * still lets those sibling window listeners run, but nothing on document or below
 * (host shortcuts, dismiss-on-Escape) ever sees the key.
 */
function handleHostKeyGuard(event) {
	if (isInsideEditorUi(event.target) || getEditing()?.targetElement?.contains(event.target)) {
		// Dismissable layers honour `defaultPrevented`, so an Escape aimed at the editor stays with it.
		if (event.key === "Escape") event.preventDefault();
		return;
	}

	event.stopPropagation();
}

function handleEditorFocusGuard(event) {
	if (isInsideEditorUi(event.target) || isInsideEditorUi(event.relatedTarget)) {
		event.stopImmediatePropagation();
	}
}

/* ------------------------------------------------------------------ *
 * Enable / disable edit mode
 * ------------------------------------------------------------------ */

function enableEditMode() {
	// Guard React reconciliation before any inline edit rewrites DOM subtrees.
	patchReactDomMutations();

	document.getElementById("root")?.setAttribute("data-edit-mode-enabled", "true");

	if (!globalClickHandler) {
		globalClickHandler = handleClick;
		document.addEventListener("click", globalClickHandler, true);
	}

	window.addEventListener("keydown", handleHistoryKeydown, true);
	window.addEventListener("keydown", handleSelectionKeydown, true);
	window.addEventListener("keydown", handleHostKeyGuard, true);
	window.addEventListener("keyup", handleHostKeyGuard, true);

	document.addEventListener("mousemove", handleTypeTooltipMouseMove, true);
	document.addEventListener("mousedown", handleTypeTooltipMouseDown, true);
	document.addEventListener("dragstart", hideTypeTooltipImmediately, true);
	document.addEventListener("mouseleave", hideTypeTooltipImmediately);
	document.addEventListener("scroll", handleTypeTooltipScroll, true);
	window.addEventListener("blur", hideTypeTooltipImmediately);

	document.addEventListener("mousedown", handleSelectMouseDown, true);
	document.addEventListener("mousemove", handleSelectMouseMove, true);
	document.addEventListener("mouseup", handleSelectMouseUp, true);
	// A mouseup outside the iframe never reaches us, so the band would stay up.
	window.addEventListener("blur", cancelDragSelect);
	document.addEventListener("visibilitychange", handleVisibilityChange);

	window.addEventListener("pointerdown", handleModalPointerDownGuard, true);
	window.addEventListener("pointerup", handleModalPointerDownGuard, true);
	window.addEventListener("focusin", handleEditorFocusGuard, true);
	window.addEventListener("focusout", handleEditorFocusGuard, true);

	if (!annotationDomObserver && typeof MutationObserver !== "undefined") {
		annotationDomObserver = new MutationObserver(scheduleAnnotationDomSync);
		annotationDomObserver.observe(document.body, { childList: true, subtree: true });
	}

	notifyDraftStateChanged();
}

function disableEditMode() {
	const editing = getEditing();
	if (editing?.targetElement?.hasAttribute("contenteditable")) {
		commitCurrentEdit();
	}

	document.getElementById("root")?.removeAttribute("data-edit-mode-enabled");

	currentImageEdit = null;
	hideAnnotationPanel();
	annotationDomObserver?.disconnect();
	annotationDomObserver = null;
	if (annotationDomSyncFrameId !== null) {
		cancelAnimationFrame(annotationDomSyncFrameId);
		annotationDomSyncFrameId = null;
	}
	clearAllAnnotationMarkers();
	setComments([]);

	if (globalClickHandler) {
		document.removeEventListener("click", globalClickHandler, true);
		globalClickHandler = null;
	}

	window.removeEventListener("keydown", handleHistoryKeydown, true);
	window.removeEventListener("keydown", handleSelectionKeydown, true);
	window.removeEventListener("keydown", handleHostKeyGuard, true);
	window.removeEventListener("keyup", handleHostKeyGuard, true);

	document.removeEventListener("mousemove", handleTypeTooltipMouseMove, true);
	document.removeEventListener("mousedown", handleTypeTooltipMouseDown, true);
	document.removeEventListener("dragstart", hideTypeTooltipImmediately, true);
	document.removeEventListener("mouseleave", hideTypeTooltipImmediately);
	document.removeEventListener("scroll", handleTypeTooltipScroll, true);
	window.removeEventListener("blur", hideTypeTooltipImmediately);

	document.removeEventListener("mousedown", handleSelectMouseDown, true);
	document.removeEventListener("mousemove", handleSelectMouseMove, true);
	document.removeEventListener("mouseup", handleSelectMouseUp, true);
	window.removeEventListener("blur", cancelDragSelect);
	document.removeEventListener("visibilitychange", handleVisibilityChange);
	window.removeEventListener("pointerdown", handleModalPointerDownGuard, true);
	window.removeEventListener("pointerup", handleModalPointerDownGuard, true);
	window.removeEventListener("focusin", handleEditorFocusGuard, true);
	window.removeEventListener("focusout", handleEditorFocusGuard, true);
	endDragSelect();
	destroySelectionRect();
	resetMultiSelectState();
	unlockHoverOutline();
	hideTypeTooltipImmediately();
	suppressTypeTooltipUntilMove = false;
	lastRawHitTestElement = null;
	lastResolvedTypeTooltipTarget = null;

	discardAllEdits();
	notifyDraftStateChanged();
}

/* ------------------------------------------------------------------ *
 * Hydration gate
 * ------------------------------------------------------------------ */

// HorizonsPreviewScripts sets the flag and fires the event from a useEffect,
// which React only flushes after the hydration render has committed.
const isHydrated = () => window.__horizonsHydrated === true;

// Covers the app never committing at all (a crash before mount): edit mode
// still turns on instead of dead-ending, matching iframe-route-restoration-client.ts.
const HYDRATION_WAIT_TIMEOUT_MS = 10000;

let pendingHydrationTasks = null;
let cancelPendingHydrationFlush = null;

function clearPendingHydrationTasks() {
	pendingHydrationTasks = null;
	if (cancelPendingHydrationFlush) {
		cancelPendingHydrationFlush();
		cancelPendingHydrationFlush = null;
	}
}

/**
 * Everything the parent posts on iframe `load` mutates server-rendered markup:
 * `enableEditMode` sets `data-edit-mode-enabled` on #root (React-rendered in
 * root.tsx), and a restored draft reapplies committed text/style edits to the
 * DOM. Doing either before hydration commits makes React 19 fail hydration and
 * re-render the whole tree from scratch. Framework mode hydrates inside a
 * `startTransition` that commits after `load`, so `load` is not a safe gate —
 * queue on the `horizons:hydrated` signal instead, preserving message order.
 */
function runWhenHydrated(task) {
	if (isHydrated()) {
		task();
		return;
	}

	if (pendingHydrationTasks) {
		pendingHydrationTasks.push(task);
		return;
	}

	pendingHydrationTasks = [task];

	const flush = () => {
		const queuedTasks = pendingHydrationTasks || [];
		clearPendingHydrationTasks();
		for (const queuedTask of queuedTasks) queuedTask();
	};

	const fallbackTimeoutId = setTimeout(flush, HYDRATION_WAIT_TIMEOUT_MS);
	window.addEventListener("horizons:hydrated", flush, { once: true });
	cancelPendingHydrationFlush = () => {
		clearTimeout(fallbackTimeoutId);
		window.removeEventListener("horizons:hydrated", flush);
	};
}

/* ------------------------------------------------------------------ *
 * Parent <-> iframe messaging
 * ------------------------------------------------------------------ */

window.addEventListener("message", function (event) {
	if (!ALLOWED_PARENT_ORIGINS.includes(event.origin)) return;

	if (event.data?.type === ChildMessage.ENABLE_EDIT_MODE) {
		if (event.data?.translations) {
			setEditorTranslations(event.data.translations);
		}
		runWhenHydrated(enableEditMode);
	}

	if (event.data?.type === ChildMessage.DISABLE_EDIT_MODE) {
		clearPendingHydrationTasks();
		disableEditMode();
	}

	// Text editing now happens in-iframe via contenteditable; `edit-save` only
	// remains to keep the existing parent-driven image picker working.
	if (event.data?.type === ChildMessage.EDIT_SAVE) {
		handleImageEditSave(event.data?.payload?.newText);
	}

	if (event.data?.type === ChildMessage.EDIT_CANCEL) {
		clearImageEdit();
	}

	if (event.data?.type === ChildMessage.DRAFT_SAVE) {
		handleDraftSave();
	}

	if (event.data?.type === ChildMessage.DRAFT_DISCARD) {
		handleDraftDiscard();
	}

	if (event.data?.type === ChildMessage.DRAFT_RESTORE) {
		const snapshot = event.data?.payload?.snapshot;
		runWhenHydrated(() => {
			applyDraftSnapshot(snapshot, { onMarkerClick: openPanelForEdit });
			notifyDraftStateChanged(ParentMessage.EDIT_STATE_CHANGED, { isDraftRestored: true });
		});
	}

	if (event.data?.type === ChildMessage.DRAFT_SNAPSHOT_REQUEST) {
		// Answering while a DRAFT_RESTORE is still queued would return an empty
		// snapshot and make the parent clear the persisted draft it just restored.
		runWhenHydrated(() => notifyDraftStateChanged());
	}

	if (event.data?.type === ChildMessage.EDIT_UNDO) {
		applySessionUndo();
	}

	if (event.data?.type === ChildMessage.EDIT_REDO) {
		applySessionRedo();
	}

	if (event.data?.type === ChildMessage.ANNOTATION_IMAGE_ATTACHED) {
		addPendingAttachments(event.data?.payload?.attachments);
	}

	if (event.data?.type === ChildMessage.ANNOTATION_OPEN_FOR_IMAGE) {
		if (!currentImageEdit) return;
		const { targetElement } = currentImageEdit;
		clearImageEdit();

		const clickX = (window.innerWidth - ANNOTATION_PANEL_WIDTH) / 2;
		const clickY = (window.innerHeight - ANNOTATION_PANEL_ESTIMATED_HEIGHT) / 2 - PANEL_GAP;
		openOrCreateAnnotation(targetElement, clickX, clickY);
	}
});
