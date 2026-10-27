import { exportDraftSnapshot, importDraftSnapshot, getEditState } from "../state/history-state.js";
import { exportAnnotationMarkers, importAnnotationMarkers } from "../ui/annotation-panel/annotation-markers.js";
import { ParentMessage } from "../constants/messages.js";
import { postToParent } from "../utils/parent-frame.js";

/**
 * Full draft snapshot for parent-frame persistence (history + annotations).
 * @returns {{ history: ReturnType<typeof exportDraftSnapshot>, annotations: ReturnType<typeof exportAnnotationMarkers> }}
 */
export function buildDraftSnapshot() {
	return {
		history: exportDraftSnapshot(),
		annotations: exportAnnotationMarkers(),
	};
}

/**
 * Restores a previously persisted draft into the live editor session.
 * @param {{ history?: object, annotations?: object[] }|null|undefined} snapshot
 * @param {{ onMarkerClick: (comment: object, clientX: number, clientY: number) => void }} options
 */
export function applyDraftSnapshot(snapshot, { onMarkerClick }) {
	if (!snapshot || typeof snapshot !== "object") return;

	importDraftSnapshot(snapshot.history);
	importAnnotationMarkers(snapshot.annotations, onMarkerClick);
}

/**
 * Updates parent with the draft on user action
 * @param {string} [type] - A {@link ParentMessage} value.
 * @param {object} [extraPayload]
 */
export function notifyDraftStateChanged(type = ParentMessage.EDIT_STATE_CHANGED, extraPayload) {
	const { pathname, hash } = window.location;

	postToParent(type, {
		...getEditState(),
		...extraPayload,
		snapshot: buildDraftSnapshot(),
		route: `${pathname}${hash}`,
	});
}
