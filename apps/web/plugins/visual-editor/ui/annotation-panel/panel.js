import { ANNOTATION_PANEL_HTML } from './template.js';
import { ANNOTATION_PANEL_STYLES } from './styles.js';
import { addAnnotationMarker, removeMarker, unhighlightAllMarkers } from './annotation-markers.js';
import { lockHoverOutline, unlockHoverOutline } from '../overlays/hover-outline.js';
import { isInFixedContext, elementZIndex, getElementType, isolateEditorUiEvents } from '../../utils/dom-utils.js';
import { captureElementMetadata } from '../../utils/selection-mode-metadata.js';
import { PANEL_GAP, PANEL_MARGIN, PARENT_TOOLBAR_HEIGHT, ANNOTATION_PANEL_WIDTH, ANNOTATION_PANEL_ESTIMATED_HEIGHT, MAX_ANNOTATION_ATTACHMENTS, TOOLTIP_VIEWPORT_MARGIN } from '../../constants/layout.js';
import {
	getComments, setComments,
	getPanelMode, setPanelMode,
	getEditingComment, setEditingComment,
	getPendingElements, setPendingElements,
	getPendingSelections, setPendingSelections,
	getPendingAttachments, setPendingAttachments,
	getAnnotationClickX, setAnnotationClickX,
	getAnnotationClickY, setAnnotationClickY,
	getEditorTranslations,
} from '../../state/annotation-state.js';
import { ICON_DELETE, ICON_IMAGE } from '../../constants/icons.js';
import { clearSelectedElements } from '../../state/multi-select-state.js';
import { Z_OFFSET_PANEL } from '../../constants/theme.js';
import { ParentMessage } from '../../constants/messages.js';
import { postToParent } from '../../utils/parent-frame.js';
import { notifyDraftStateChanged } from '../../api/draft-snapshot.js';
import { getEditing } from '../../state/editing-state.js';
import { startInlineEdit, commitCurrentEdit } from '../inline-edit/edit-action.js';
import { showTextFormatToolbar, hideTextFormatToolbar, getToolbarEl } from '../text-format/toolbar/toolbar.js';

const DEFAULT_LABELS = {
	annotationAddComment: 'Add comment',
	annotationSaveComment: 'Save comment',
	annotationPlaceholder: 'Tell AI what to change',
	annotationElementSelected: '{count} element selected',
	annotationElementsSelected: '{count} elements selected',
	annotationAttachImage: 'Add images',
	annotationRemoveImage: 'Remove image',
	annotationDeleteComment: 'Delete comment',
};

/** Gap (px) between a panel button and the tooltip floating above it. */
const BUTTON_TOOLTIP_GAP = 8;

function label(key, replacements = {}) {
	const raw = getEditorTranslations()[key] || DEFAULT_LABELS[key] || key;
	return Object.entries(replacements).reduce(
		(text, [token, value]) => text.replace(`{${token}}`, value), raw
	);
}

let _annotationPanelEl = null;
let _buttonTooltipEl = null;
let _stylesInjected = false;
let _panelKeydownHandler = null;
let _isAttachmentUploadInProgress = false;
// Attachments already stored on the comment when the panel opened, so cancelling
// can tell apart images added this session from ones the user saved earlier.
let _savedAttachments = [];

function selectionLabel(elements) {
	const count = elements.length;
	const key = count === 1 ? 'annotationElementSelected' : 'annotationElementsSelected';
	return label(key, { count });
}

function ensureStyles() {
	if (_stylesInjected) return;
	const style = document.createElement('style');
	style.id = 'annotation-panel-styles';
	style.textContent = ANNOTATION_PANEL_STYLES;
	document.head.appendChild(style);
	_stylesInjected = true;
}

function ensurePanelElement() {
	if (_annotationPanelEl) return _annotationPanelEl;
	ensureStyles();

	const wrapper = document.createElement('div');
	wrapper.innerHTML = ANNOTATION_PANEL_HTML;
	_annotationPanelEl = wrapper.firstElementChild;
	document.body.appendChild(_annotationPanelEl);

	const textarea = _annotationPanelEl.querySelector('#selection-mode-annotation-textarea');
	const commentBtn = _annotationPanelEl.querySelector('#selection-mode-comment-btn');
	const discardBtn = _annotationPanelEl.querySelector('#selection-mode-discard-btn');
	const deleteBtn = _annotationPanelEl.querySelector('#selection-mode-delete-btn');
	const attachImageBtn = _annotationPanelEl.querySelector('#selection-mode-attach-image-btn');

	textarea.placeholder = label('annotationPlaceholder');
	commentBtn.textContent = label('annotationAddComment');
	attachImageBtn.setAttribute('aria-label', label('annotationAttachImage'));
	deleteBtn.setAttribute('aria-label', label('annotationDeleteComment'));
	bindButtonTooltip(attachImageBtn);
	bindButtonTooltip(deleteBtn);

	textarea.addEventListener('input', () => {
		commentBtn.disabled = !textarea.value.trim();
	});

	commentBtn.addEventListener('click', handleCommentClick);
	discardBtn.addEventListener('click', handleDiscardClick);
	deleteBtn.addEventListener('click', handleDeleteClick);
	attachImageBtn.addEventListener('click', () => {
		if (attachImageBtn.disabled) return;
		setAttachmentUploadInProgress(true);
		postToParent(ParentMessage.ANNOTATION_IMAGE_ATTACH_REQUESTED);
	});

	isolateEditorUiEvents(_annotationPanelEl);

	return _annotationPanelEl;
}

/**
 * Shows the editor's hover tooltip centred above a panel button, reusing the
 * `element-type-tooltip` look. The tooltip is a child of the panel: the panel
 * computes its own z-index from the elements it annotates, so a tooltip
 * anywhere else on the page could not reliably paint over it. Offsets are
 * therefore measured against the panel's own box rather than the viewport.
 * @param {HTMLButtonElement} button
 */
function showButtonTooltip(button) {
	const text = button.getAttribute('aria-label');
	if (!text || !_annotationPanelEl) return;

	if (!_buttonTooltipEl) {
		_buttonTooltipEl = document.createElement('div');
		_buttonTooltipEl.className = 'element-type-tooltip selection-mode-button-tooltip';
		_annotationPanelEl.appendChild(_buttonTooltipEl);
	}

	_buttonTooltipEl.textContent = text;
	_buttonTooltipEl.classList.add('active');

	const panelRect = _annotationPanelEl.getBoundingClientRect();
	const buttonRect = button.getBoundingClientRect();
	const { width, height } = _buttonTooltipEl.getBoundingClientRect();
	const centeredLeft = buttonRect.left + (buttonRect.width - width) / 2;
	const clampedLeft = Math.min(
		Math.max(centeredLeft, TOOLTIP_VIEWPORT_MARGIN),
		Math.max(TOOLTIP_VIEWPORT_MARGIN, window.innerWidth - width - TOOLTIP_VIEWPORT_MARGIN)
	);

	_buttonTooltipEl.style.left = `${clampedLeft - panelRect.left}px`;
	_buttonTooltipEl.style.top = `${buttonRect.top - panelRect.top - height - BUTTON_TOOLTIP_GAP}px`;
}

function hideButtonTooltip() {
	_buttonTooltipEl?.classList.remove('active');
}

function bindButtonTooltip(button) {
	button.addEventListener('mouseenter', () => {
		if (button.disabled) return;
		showButtonTooltip(button);
	});
	button.addEventListener('mouseleave', hideButtonTooltip);
	button.addEventListener('blur', hideButtonTooltip);
	button.addEventListener('click', hideButtonTooltip);
}

function setAttachmentUploadInProgress(isUploading) {
	_isAttachmentUploadInProgress = Boolean(isUploading);
	updateAttachImageButtonState();
}

function releaseAttachments(attachments) {
	attachments.forEach(({ url }) => postToParent(ParentMessage.ANNOTATION_IMAGE_REMOVED, { url }));
}

function attachmentsNotIn(attachments, others) {
	const urls = new Set(others.map(({ url }) => url));
	return attachments.filter(({ url }) => !urls.has(url));
}

/**
 * Adds attachments the parent frame finished uploading to the open panel.
 * Clears the paperclip loading state started when attach was requested.
 * @param {import('../../state/annotation-state.js').AnnotationAttachment[]} attachments
 */
export function addPendingAttachments(attachments) {
	setAttachmentUploadInProgress(false);

	if (!attachments?.length) return;

	if (!_annotationPanelEl?.classList.contains('active')) {
		releaseAttachments(attachments);
		return;
	}

	setPendingAttachments([...getPendingAttachments(), ...attachments]);
	renderAttachments();
}

function removePendingAttachment(url) {
	const removed = getPendingAttachments().filter(attachment => attachment.url === url);
	setPendingAttachments(getPendingAttachments().filter(attachment => attachment.url !== url));
	renderAttachments();

	// An image already stored on the comment is only released once Save confirms
	// the removal, so cancelling the panel can bring it back.
	if (!_savedAttachments.some(attachment => attachment.url === url)) {
		releaseAttachments(removed);
	}
}

function getVisualEditorAttachmentCount() {
	const editing = getEditingComment();
	const savedAttachmentsCount = getComments().reduce((total, comment) => {
		if (comment === editing) {
			return total;
		}

		return total + (comment.attachments?.length ?? 0);
	}, 0);

	return savedAttachmentsCount + getPendingAttachments().length;
}

function updateAttachImageButtonState() {
	const attachImageBtn = _annotationPanelEl?.querySelector('#selection-mode-attach-image-btn');
	if (!attachImageBtn) return;

	const isAtLimit = getVisualEditorAttachmentCount() >= MAX_ANNOTATION_ATTACHMENTS;
	const isUploading = _isAttachmentUploadInProgress;

	attachImageBtn.disabled = isAtLimit || isUploading;
	attachImageBtn.classList.toggle('is-loading', isUploading);
	attachImageBtn.innerHTML = isUploading
		? '<span class="selection-mode-attach-spinner" aria-hidden="true"></span>'
		: ICON_IMAGE;
	if (attachImageBtn.disabled) hideButtonTooltip();
}

function renderAttachments() {
	const container = _annotationPanelEl?.querySelector('#selection-mode-annotation-attachments');
	if (!container) return;

	const attachments = getPendingAttachments();
	container.textContent = '';
	container.classList.toggle('active', attachments.length > 0);

	attachments.forEach(({ url, fileName }) => {
		const chip = document.createElement('div');
		chip.className = 'selection-mode-annotation-attachment';

		const thumbnail = document.createElement('img');
		thumbnail.className = 'selection-mode-annotation-attachment-thumb';
		thumbnail.src = url;
		thumbnail.alt = fileName;
		thumbnail.title = fileName;
		thumbnail.loading = 'lazy';
		thumbnail.decoding = 'async';
		thumbnail.addEventListener('click', () => {
			const allAttachments = getPendingAttachments().map(({ url: attachmentUrl, fileName: attachmentName }) => ({
				url: attachmentUrl,
				fileName: attachmentName,
			}));
			postToParent(ParentMessage.ANNOTATION_IMAGE_PREVIEW_REQUESTED, { url, attachments: allAttachments });
		});

		const removeBtn = document.createElement('button');
		removeBtn.className = 'selection-mode-annotation-attachment-remove';
		removeBtn.title = label('annotationRemoveImage');
		removeBtn.innerHTML = ICON_DELETE;
		removeBtn.addEventListener('click', () => removePendingAttachment(url));

		chip.append(thumbnail, removeBtn);
		container.appendChild(chip);
	});

	updateAttachImageButtonState();
}

function notifyEditStateChanged() {
	notifyDraftStateChanged();
}

function handleCommentClick() {
	const textarea = _annotationPanelEl.querySelector('#selection-mode-annotation-textarea');
	const text = textarea.value.trim();
	if (!text) return;

	if (getPanelMode() === 'edit') {
		const editing = getEditingComment();
		if (editing) {
			editing.text = text;
			editing.attachments = getPendingAttachments();
			notifyEditStateChanged();
		}
		hideAnnotationPanel({ commitPendingAttachments: true });
		return;
	}

	const elements = getPendingElements();
	const selections = getPendingSelections();
	const clickX = getAnnotationClickX();
	const clickY = getAnnotationClickY();

	const comment = {
		elements,
		selections,
		text,
		attachments: getPendingAttachments(),
		clickX,
		clickY,
		fixed: elements.length ? isInFixedContext(elements[0]) : false,
	};
	setComments([...getComments(), comment]);
	addAnnotationMarker(comment, openPanelForEdit);
	notifyEditStateChanged();
	hideAnnotationPanel({ commitPendingAttachments: true });
}

function handleDiscardClick() {
	hideAnnotationPanel();
}

function handleDeleteClick() {
	const editing = getEditingComment();
	if (!editing) return;

	releaseAttachments(editing.attachments ?? []);

	removeMarker(editing);
	setComments(getComments().filter(c => c !== editing));
	notifyEditStateChanged();
	hideAnnotationPanel();
}

function positionPanel(clickX, clickY, elements, anchorTop = clickY) {
	const panel = _annotationPanelEl;
	const fixed = elements.length ? isInFixedContext(elements[0]) : false;
	panel.style.position = fixed ? 'fixed' : 'absolute';

	const scrollX = fixed ? 0 : window.scrollX;
	const scrollY = fixed ? 0 : window.scrollY;

	let left = clickX;
	let top = clickY + PANEL_GAP;

	if (left + ANNOTATION_PANEL_WIDTH > window.innerWidth - PANEL_MARGIN) {
		left = window.innerWidth - ANNOTATION_PANEL_WIDTH - PANEL_MARGIN;
	}
	if (left < PANEL_MARGIN) left = PANEL_MARGIN;

	if (top + ANNOTATION_PANEL_ESTIMATED_HEIGHT > window.innerHeight - PARENT_TOOLBAR_HEIGHT - PANEL_MARGIN) {
		// anchorTop is the anchor's top edge (equals clickY for a plain click
		// point, but the toolbar's top when anchored to it) so the panel
		// flips fully above the anchor instead of overlapping its bottom half.
		top = anchorTop - ANNOTATION_PANEL_ESTIMATED_HEIGHT - PANEL_GAP;
	}
	if (top < PANEL_MARGIN) top = PANEL_MARGIN;

	panel.style.left = `${left + scrollX}px`;
	panel.style.top = `${top + scrollY}px`;
	// A group's panel must clear the highest-stacked element it annotates.
	panel.style.zIndex = (elements.length ? Math.max(...elements.map(elementZIndex)) : 0) + Z_OFFSET_PANEL;
}

/**
 * Opens the panel in create mode for a group of one or more elements.
 * @param {HTMLElement[]} elements
 * @param {object[]} selections - `captureElementMetadata` output, one per element.
 */
export function showAnnotationPanel(elements, selections, clickX, clickY, anchorTop = clickY) {
	const panel = ensurePanelElement();

	setPendingElements(elements);
	setPendingSelections(selections);
	setPendingAttachments([]);
	_savedAttachments = [];
	setAnnotationClickX(clickX);
	setAnnotationClickY(clickY);
	setPanelMode('create');
	setEditingComment(null);

	const textarea = panel.querySelector('#selection-mode-annotation-textarea');
	const commentBtn = panel.querySelector('#selection-mode-comment-btn');
	const deleteWrapper = panel.querySelector('#selection-mode-delete-wrapper');
	const countEl = panel.querySelector('#selection-mode-annotation-count');

	textarea.value = '';
	commentBtn.disabled = true;
	commentBtn.textContent = label('annotationAddComment');
	deleteWrapper.style.display = 'none';
	countEl.textContent = selectionLabel(elements);
	renderAttachments();

	lockHoverOutline(elements);
	positionPanel(clickX, clickY, elements, anchorTop);
	panel.classList.add('active');
	textarea.focus();

	attachPanelKeydown();
}

export function openPanelForEdit(comment, clickX, clickY) {
	const panel = ensurePanelElement();
	const elements = comment.elements;
	const single = elements.length === 1 ? elements[0] : null;

	const currentEditing = getEditing();
	if (currentEditing && currentEditing.targetElement !== single) {
		hideTextFormatToolbar();
		commitCurrentEdit();
	}

	const elementType = single ? getElementType(single) : null;
	const openToolbar = !!single
		&& (elementType === 'text' || elementType === 'button')
		&& (single.hasAttribute('data-edit-id') || single.hasAttribute('data-edit-assisted-id'));

	setPanelMode('edit');
	setEditingComment(comment);
	setPendingElements(elements);
	setPendingSelections(comment.selections);
	setPendingAttachments(comment.attachments ? [...comment.attachments] : []);
	_savedAttachments = comment.attachments ? [...comment.attachments] : [];
	setAnnotationClickX(clickX);
	setAnnotationClickY(clickY);

	const textarea = panel.querySelector('#selection-mode-annotation-textarea');
	const commentBtn = panel.querySelector('#selection-mode-comment-btn');
	const deleteWrapper = panel.querySelector('#selection-mode-delete-wrapper');
	const countEl = panel.querySelector('#selection-mode-annotation-count');

	countEl.textContent = selectionLabel(elements);
	textarea.value = comment.text;
	commentBtn.disabled = !comment.text.trim();
	commentBtn.textContent = label('annotationSaveComment');
	deleteWrapper.style.display = 'flex';
	renderAttachments();

	let anchorTop = clickY;
	if (openToolbar) {
		if (!getEditing() || getEditing().targetElement !== single) {
			const editId = single.getAttribute('data-edit-id') || single.getAttribute('data-edit-assisted-id');
			if (editId) {
				startInlineEdit(single, editId, single.innerHTML || "", { focusTarget: false });
			}
		}
		showTextFormatToolbar(single);
		const toolbarRect = getToolbarEl()?.getBoundingClientRect();
		if (toolbarRect) {
			clickX = toolbarRect.left;
			clickY = toolbarRect.bottom;
			anchorTop = toolbarRect.top;
		}
	}

	panel.classList.add('active');
	lockHoverOutline(elements);
	unhighlightAllMarkers();
	if (comment.marker) comment.marker.classList.add('highlighted');
	positionPanel(clickX, clickY, elements, anchorTop);

	textarea.focus();
	attachPanelKeydown();
}

/**
 * `restoreFocus: false` skips re-focusing the inline edit, whose `selectionchange`
 * would close a panel the caller opens next; `keepSelection` keeps the group.
 * `commitPendingAttachments` keeps the images the caller just saved onto a comment
 * and releases the ones it dropped; without it the panel is cancelling, so images
 * added during this session are released and previously saved ones are kept.
 * @param {{ restoreFocus?: boolean, keepSelection?: boolean, commitPendingAttachments?: boolean }} [options]
 */
export function hideAnnotationPanel({ restoreFocus = true, keepSelection = false, commitPendingAttachments = false } = {}) {
	if (!_annotationPanelEl?.classList.contains('active')) return;

	releaseAttachments(commitPendingAttachments
		? attachmentsNotIn(_savedAttachments, getPendingAttachments())
		: attachmentsNotIn(getPendingAttachments(), _savedAttachments));

	_annotationPanelEl.classList.remove('active');
	hideButtonTooltip();
	setAttachmentUploadInProgress(false);

	setPendingElements([]);
	setPendingSelections([]);
	setPendingAttachments([]);
	_savedAttachments = [];
	setEditingComment(null);
	setPanelMode('create');
	if (!keepSelection) clearSelectedElements();

	unlockHoverOutline();
	unhighlightAllMarkers();

	const editing = getEditing();
	if (restoreFocus && editing?.targetElement?.hasAttribute('contenteditable')) {
		editing.targetElement.focus({ preventScroll: true });
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(editing.targetElement);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	detachPanelKeydown();
}

export function getAnnotationPanelEl() {
	return _annotationPanelEl;
}


function attachPanelKeydown() {
	detachPanelKeydown();
	_panelKeydownHandler = (event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			hideAnnotationPanel();
		}
	};
	window.addEventListener('keydown', _panelKeydownHandler, true);
}

function detachPanelKeydown() {
	if (_panelKeydownHandler) {
		window.removeEventListener('keydown', _panelKeydownHandler, true);
		_panelKeydownHandler = null;
	}
}

/**
 * Opens the panel for one element or a group, resuming the existing comment when
 * the same target is already annotated and capturing fresh metadata otherwise.
 * @param {HTMLElement|HTMLElement[]} target
 * @param {number} clickX
 * @param {number} clickY
 * @param {number} [anchorTop] - Top edge of the anchor (e.g. a toolbar) used
 *   when flipping the panel above; defaults to clickY for a plain click point.
 */
export function openOrCreateAnnotation(target, clickX, clickY, anchorTop = clickY) {
	const elements = (Array.isArray(target) ? target : [target]).filter(Boolean);
	if (!elements.length) return;

	const existing = getComments().find(comment => comment.elements.length === elements.length
		&& comment.elements.every(element => elements.includes(element)));

	if (existing) {
		openPanelForEdit(existing, existing.clickX, existing.clickY);
	} else {
		showAnnotationPanel(elements, elements.map(captureElementMetadata), clickX, clickY, anchorTop);
	}
}
