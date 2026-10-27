/**
 * A reference attachment the user added to a comment.
 * @typedef {{ url: string, fileName: string, size: number, type: 'image' }} AnnotationAttachment
 */

/**
 * A comment always targets a group: `elements` and `selections` are parallel,
 * one entry per annotated element. A single annotation is just a group of one.
 * @typedef {{
 *   elements: HTMLElement[],
 *   selections: object[],
 *   text: string,
 *   attachments: AnnotationAttachment[],
 *   clickX: number,
 *   clickY: number,
 *   fixed: boolean,
 *   marker?: HTMLElement,
 * }} AnnotationComment
 */

let _editorTranslations = {};
/** @type {AnnotationComment[]} */
let _comments = [];
let _panelMode = 'create';
let _editingComment = null;
/** @type {HTMLElement[]} */
let _pendingElements = [];
/** @type {object[]} */
let _pendingSelections = [];
/** @type {AnnotationAttachment[]} */
let _pendingAttachments = [];
let _annotationClickX = 0;
let _annotationClickY = 0;

export function getComments() { return _comments; }
export function setComments(value) { _comments = value; }

export function getPanelMode() { return _panelMode; }
export function setPanelMode(value) { _panelMode = value; }

export function getEditingComment() { return _editingComment; }
export function setEditingComment(value) { _editingComment = value; }

export function getPendingElements() { return _pendingElements; }
export function setPendingElements(value) { _pendingElements = value ?? []; }

export function getPendingSelections() { return _pendingSelections; }
export function setPendingSelections(value) { _pendingSelections = value ?? []; }

export function getPendingAttachments() { return _pendingAttachments; }
export function setPendingAttachments(value) { _pendingAttachments = value ?? []; }

export function getAnnotationClickX() { return _annotationClickX; }
export function setAnnotationClickX(value) { _annotationClickX = value; }

export function getAnnotationClickY() { return _annotationClickY; }
export function setAnnotationClickY(value) { _annotationClickY = value; }

export function getEditorTranslations() { return _editorTranslations; }
export function setEditorTranslations(value) { _editorTranslations = value; }
