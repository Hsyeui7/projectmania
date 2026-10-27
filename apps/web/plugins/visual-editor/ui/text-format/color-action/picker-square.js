/**
 * Wires mousedown/drag on the SV square to saturation/value callbacks.
 * @param {HTMLElement} squareElement
 * @param {{ onDragStart: (s: number, v: number) => void, onPickChange: (s: number, v: number) => void, onDragEnd: () => void }} callbacks
 */
export function initPickerSquare(squareElement, callbacks) {
	const { onDragStart, onPickChange, onDragEnd } = callbacks;

	squareElement.addEventListener('mousedown', (event) => {
		const { s: saturation, v: value } = getSaturationValueFromPointer(event, squareElement);
		onDragStart(saturation, value);

		function onMove(event) {
			event.preventDefault();
			const { s: saturation, v: value } = getSaturationValueFromPointer(event, squareElement);
			onPickChange(saturation, value);
		}
		function onUp(event) {
			event.preventDefault();
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			onDragEnd();
		}
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});
}

function getSaturationValueFromPointer(event, squareElement) {
	const bounds = squareElement.getBoundingClientRect();
	return {
		s: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
		v: Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height)),
	};
}
