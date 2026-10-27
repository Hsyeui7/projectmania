import { ParentMessage } from '../constants/messages.js';
import { undo, redo } from '../state/history-state.js';
import { notifyDraftStateChanged } from '../api/draft-snapshot.js';

/**
 * Applies one undo/redo step and notifies the parent frame when an action ran.
 * @param {'undo'|'redo'} direction
 * @returns {object|null}
 */
function applySessionHistoryStep(direction) {
	const action = direction === 'undo' ? undo() : redo();
	if (!action) return null;

	notifyDraftStateChanged(
		direction === 'undo' ? ParentMessage.EDIT_UNDO_APPLIED : ParentMessage.EDIT_REDO_APPLIED,
		{
			editId: action.editId,
			value: direction === 'undo' ? action.instruction.beforeContent : action.instruction.afterContent,
		},
	);

	return action;
}

/** @returns {object|null} */
export function applySessionUndo() {
	return applySessionHistoryStep('undo');
}

/** @returns {object|null} */
export function applySessionRedo() {
	return applySessionHistoryStep('redo');
}
