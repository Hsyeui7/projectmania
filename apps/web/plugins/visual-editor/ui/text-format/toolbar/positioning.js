import { PARENT_TOOLBAR_HEIGHT } from '../../../constants/layout.js';
import { isInFixedContext } from '../../../utils/dom-utils.js';

let _toolbarElement = null;
let _toolbarTarget = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let toolbarSide = 'below';

/** @param {HTMLElement|null} element */
export function setPositioningEl(element) { _toolbarElement = element; }
/** @param {HTMLElement|null} element */
export function setPositioningTarget(element) { _toolbarTarget = element; }
/** Resets user drag offset to zero. */
export function resetDragOffset() { dragOffset = { x: 0, y: 0 }; }

/**
 * Chooses above vs below placement based on viewport space.
 * @returns {'above'|'below'}
 */
export function lockToolbarSide() {
    const targetBounds = _toolbarTarget.getBoundingClientRect();
    const toolbarHeight = _toolbarElement.offsetHeight;
    const GAP = 10;
    const fitsBelow = window.innerHeight - PARENT_TOOLBAR_HEIGHT - targetBounds.bottom >= 88;
    const fitsAbove = targetBounds.top - toolbarHeight - GAP >= 0;
    toolbarSide = (!fitsBelow && fitsAbove) ? 'above' : 'below';
    return toolbarSide;
}

/**
 * @returns {boolean} True when the toolbar is anchored to a viewport-fixed
 * element (fixed/sticky ancestor) and must therefore use `position: fixed`.
 * Document-flow elements use `position: absolute` so the toolbar scrolls with
 * the page natively (no per-scroll repositioning, no jitter).
 */
export function isToolbarFixedToViewport() {
    return !!_toolbarTarget && isInFixedContext(_toolbarTarget);
}

/** Applies locked side and drag offset to position the toolbar. */
export function positionToolbar() {
    if (!_toolbarTarget || !_toolbarElement) return;
    const targetBounds = _toolbarTarget.getBoundingClientRect();
    const toolbarWidth = _toolbarElement.offsetWidth;
    const toolbarHeight = _toolbarElement.offsetHeight;
    const GAP = 10;
    const MARGIN = 8;

    // Anchor in document coordinates (position:absolute) so the toolbar scrolls
    // together with the element natively. Elements inside fixed/sticky ancestors
    // stay in the viewport while the page scrolls, so they keep position:fixed.
    const fixed = isInFixedContext(_toolbarTarget);
    _toolbarElement.style.position = fixed ? 'fixed' : 'absolute';
    const scrollX = fixed ? 0 : window.scrollX;
    const scrollY = fixed ? 0 : window.scrollY;

    // Use the side locked when the toolbar was shown — don't re-evaluate on scroll.
    const baseTop = (toolbarSide === 'above'
        ? targetBounds.top - toolbarHeight - GAP
        : targetBounds.bottom + GAP) + scrollY;

    const baseLeft = Math.min(targetBounds.left - 4, window.innerWidth - toolbarWidth - MARGIN) + scrollX;

    let left = baseLeft + dragOffset.x;
    let top  = baseTop  + dragOffset.y;

    if (isDragging) {
        left = Math.max(MARGIN + scrollX, Math.min(left, scrollX + window.innerWidth  - toolbarWidth - MARGIN));
        top  = Math.max(MARGIN + scrollY, Math.min(top,  scrollY + window.innerHeight - PARENT_TOOLBAR_HEIGHT - toolbarHeight - MARGIN));
    }

    _toolbarElement.style.left = `${left}px`;
    _toolbarElement.style.top  = `${top}px`;
}

function onDragMove(event) {
    if (!isDragging) return;
    dragOffset.x = event.clientX - dragStart.x;
    dragOffset.y = event.clientY - dragStart.y;
    positionToolbar();
}

function onDragEnd() {
    isDragging = false;
    _toolbarElement?.classList.remove('tft-dragging');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
}

/**
 * Begins toolbar drag tracking.
 * @param {MouseEvent} event
 */
export function startDrag(event) {
    isDragging = true;
    dragStart = { x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y };
    _toolbarElement.classList.add('tft-dragging');
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
}

/** Repositions the toolbar on scroll and closes the more-formatting panel. */
export function onToolbarScroll() {
    _toolbarElement.querySelector('.tft-more-panel')?.classList.remove('tft-open');
    positionToolbar();
}
