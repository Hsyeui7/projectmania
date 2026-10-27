import { ICON_DELETE, ICON_CLOSE, ICON_IMAGE } from '../../constants/icons.js';

export const ANNOTATION_PANEL_HTML = `
<div id="selection-mode-annotation-panel">
	<div id="selection-mode-annotation-header">
		<span id="selection-mode-annotation-count"></span>
		<button id="selection-mode-discard-btn" title="Close">${ICON_CLOSE}</button>
	</div>
	<div id="selection-mode-annotation-input-wrapper">
		<div id="selection-mode-annotation-attachments"></div>
		<textarea id="selection-mode-annotation-textarea" placeholder="Tell AI what to change" rows="1"></textarea>
	</div>
	<div id="selection-mode-annotation-buttons">
		<div id="selection-mode-annotation-actions">
			<button id="selection-mode-attach-image-btn" aria-label="Add images">${ICON_IMAGE}</button>
		</div>
		<div id="selection-mode-annotation-primary-actions">
			<div id="selection-mode-delete-wrapper">
				<button id="selection-mode-delete-btn" aria-label="Delete comment">${ICON_DELETE}</button>
			</div>
			<button id="selection-mode-comment-btn" disabled>Add comment</button>
		</div>
	</div>
</div>
`;
