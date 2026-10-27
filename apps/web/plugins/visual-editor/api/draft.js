import { ParentMessage } from "../constants/messages.js";
import { postToParent } from "../utils/parent-frame.js";
import { getEditing } from "../state/editing-state.js";
import { getCurrentEdits, clearHistory, getEditState, getActionPointer } from "../state/history-state.js";
import { applySessionUndo } from "../utils/session-history-command.js";
import { commitCurrentEdit } from "../ui/inline-edit/edit-action.js";
import { getComments, setComments } from "../state/annotation-state.js";
import { getEditId } from "../constants/selectors.js";
import { clearAllAnnotationMarkers } from "../ui/annotation-panel/annotation-markers.js";
import { hideAnnotationPanel } from "../ui/annotation-panel/panel.js";
import { resetMultiSelectState } from "../state/multi-select-state.js";
import { unlockHoverOutline } from "../ui/overlays/hover-outline.js";

/** Relative URL used to persist draft edits to the server. */
const DRAFT_SAVE_API_URL = "/api/draft-save";
/** Minimum duration (ms) the parent loading indicator stays visible during a direct-only draft save. */
const MIN_LOADING_DISPLAY_MS = 500;

/**
 * Rolls back every committed edit in the history stack and clears it, returning
 * the document to its pre-edit state.
 */
export function discardAllEdits() {
	while (getActionPointer() >= 0) {
		applySessionUndo();
	}
	clearHistory();
}

/**
 * Commits any active inline edit, rolls back all edits in the history stack,
 * clears annotations, and notifies the parent frame that the draft was discarded.
 */
export function handleDraftDiscard() {
	if (getEditing()?.targetElement?.hasAttribute("contenteditable")) {
		commitCurrentEdit();
	}
	discardAllEdits();
	hideAnnotationPanel();
	clearAllAnnotationMarkers();
	setComments([]);
	resetMultiSelectState();
	unlockHoverOutline();
	postToParent(ParentMessage.DRAFT_DISCARDED);
}

/**
 * Persists the current draft edits to the server.
 *
 * Commits any active contenteditable edit first, then POSTs the direct edits to
 * `DRAFT_SAVE_API_URL`. Assisted edits and annotations are applied by the AI
 * during the stream that follows, so a draft holding only those skips the
 * request entirely.
 *
 * Parent frame messages emitted:
 * - `DRAFT_SAVE_STARTED` — immediately on call
 * - `DRAFT_APPLIED` — on success, includes server results and current edit state
 * - `DRAFT_SAVE_FAILED` — on server error or network failure, includes error message
 * - `DRAFT_SAVE_FINISHED` — always, delayed by `MIN_LOADING_DISPLAY_MS` for direct-only saves
 *
 * @returns {Promise<void>}
 */
export async function handleDraftSave() {
	if (getEditing()?.targetElement?.hasAttribute("contenteditable")) {
		commitCurrentEdit();
	}
	postToParent(ParentMessage.DRAFT_SAVE_STARTED);
	const startTime = Date.now();
	let hasAssistedEdits = false;
	try {
		const allEdits = getCurrentEdits();

		const draft = Object.fromEntries(
			Object.entries(allEdits)
				.filter(([, edit]) => !edit.isAssisted)
				.map(([key, edit]) => {
					const sourceEdit = { ...edit };
					delete sourceEdit.editId;
					return [key, sourceEdit];
				})
		);

		const visualEdits = [
			...Object.values(allEdits).map(edit => ({
				editId: edit.editId,
				selectionModes: [edit.selectionMode],
				instruction: edit.instruction,
				isAssisted: edit.isAssisted,
			})),
			...getComments().map(({ text, elements, selections, attachments }) => ({
				editId: elements.length === 1 ? getEditId(elements[0]) || undefined : undefined,
				selectionModes: selections,
				instruction: {
					changes: [],
					annotation: text,
					...(attachments?.length && {
						attachments: attachments.map(({ url }) => ({ type: 'image', image: url })),
					}),
				},
				isAssisted: true,
			})),
		];

		hasAssistedEdits = visualEdits.some(edit => edit.isAssisted);

		let result = { success: true, results: [] };

		if (Object.keys(draft).length) {
			const response = await fetch(DRAFT_SAVE_API_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ draft }),
			});

			result = await response.json();
		}

		if (result.success) {
			clearHistory();
			hideAnnotationPanel();
			clearAllAnnotationMarkers();
			setComments([]);
			resetMultiSelectState();
			unlockHoverOutline();
			postToParent(ParentMessage.DRAFT_APPLIED, {
				results: result.results,
				visualEdits,
				...getEditState(),
			});
		} else {
			postToParent(ParentMessage.DRAFT_SAVE_FAILED, { error: result.error });
			console.error(`[vite][visual-editor] Error saving draft: ${result.error}`);
		}
	} catch (error) {
		postToParent(ParentMessage.DRAFT_SAVE_FAILED, { error: error.message });
		console.error(`[vite][visual-editor] Error during draft save:`, error);
	} finally {
		if (!hasAssistedEdits) {
			const elapsed = Date.now() - startTime;
			const remaining = MIN_LOADING_DISPLAY_MS - elapsed;
			if (remaining > 0) {
				await new Promise((resolve) => setTimeout(resolve, remaining));
			}
		}
		postToParent(ParentMessage.DRAFT_SAVE_FINISHED);
	}
}
