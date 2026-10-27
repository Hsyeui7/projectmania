/** Message types sent from the iframe to the parent Horizons frame. */
export const ParentMessage = {
	EDIT_APPLIED: 'editApplied',
	EDIT_CANCEL: 'editCancel',
	EDIT_ENTER: 'editEnter',
	IMAGE_EDIT_ENTER: 'imageEditEnter',
	EDIT_STATE_CHANGED: 'editStateChanged',
	EDIT_UNDO_APPLIED: 'undoApplied',
	EDIT_REDO_APPLIED: 'redoApplied',
	DRAFT_SAVE_STARTED: 'draftSaveStarted',
	DRAFT_APPLIED: 'draftApplied',
	DRAFT_SAVE_FAILED: 'draftSaveFailed',
	DRAFT_SAVE_FINISHED: 'draftSaveFinished',
	DRAFT_DISCARDED: 'draftDiscarded',
	ANNOTATION_PANEL_OPENED: 'annotationPanelOpened',
	ANNOTATION_IMAGE_ATTACH_REQUESTED: 'annotationImageAttachRequested',
	ANNOTATION_IMAGE_REMOVED: 'annotationImageRemoved',
	ANNOTATION_IMAGE_PREVIEW_REQUESTED: 'annotationImagePreviewRequested',
}

/** Message types sent from the parent Horizons frame to the iframe. */
export const ChildMessage = {
	ENABLE_EDIT_MODE: 'enable-edit-mode',
	DISABLE_EDIT_MODE: 'disable-edit-mode',
	EDIT_SAVE: 'edit-save',
	DRAFT_SAVE: 'draft-save',
	DRAFT_DISCARD: 'draft-discard',
	DRAFT_RESTORE: 'draft-restore',
	DRAFT_SNAPSHOT_REQUEST: 'draft-snapshot-request',
	EDIT_UNDO: 'edit-undo',
	EDIT_REDO: 'edit-redo',
	EDIT_CANCEL: 'edit-cancel',
	ANNOTATION_OPEN_FOR_IMAGE: 'annotation-open-for-image',
	ANNOTATION_IMAGE_ATTACHED: 'annotation-image-attached',
}
