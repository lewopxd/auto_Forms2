/**
 * Modal Manager Module
 * Provides professional, reusable, and robust modal behavior:
 * - Draggable (with viewport constraints)
 * - Event Blocking during drag
 * - Centering
 * - Z-Index Management
 * - Robust Open/Close State
 */
const ModalManager = (function () {
    'use strict';

    // State for dragging
    let isDragging = false;
    let dragTarget = null; // The modal element being dragged
    let dragOffset = { x: 0, y: 0 };
    let overlayBlocker = null; // Element to block UI events during drag

    // Initialize Global Listeners
    function init() {
        window.addEventListener('mousemove', handleDragMove, { passive: false });
        window.addEventListener('mouseup', handleDragEnd);

        // Create global drag overlay blocker
        overlayBlocker = document.createElement('div');
        overlayBlocker.style.position = 'fixed';
        overlayBlocker.style.inset = '0';
        overlayBlocker.style.zIndex = '99999'; // Highest priority
        overlayBlocker.style.cursor = 'move';
        overlayBlocker.style.display = 'none';
        overlayBlocker.style.background = 'transparent'; // Invisible but blocks pointers
        document.body.appendChild(overlayBlocker);
    }

    /**
     * Makes a modal draggable via a specific handle (usually the header)
     * @param {HTMLElement} modalEl - The modal container element
     * @param {HTMLElement} handleEl - The element that initiates drag (header)
     */
    /**
     * Makes a modal draggable via a specific handle (usually the header)
     */
    function makeDraggable(modalEl, handleEl) {
        if (!modalEl || !handleEl) return;

        handleEl.style.cursor = 'grab';

        handleEl.onmousedown = (e) => {
            // Only left mouse button
            if (e.button !== 0) return;

            // PREVENT DRAG if clicking on a button, close icon, or input
            if (e.target.closest('button') ||
                e.target.closest('.af-window-close') ||
                e.target.closest('input') ||
                e.target.closest('.no-drag')) {
                return;
            }

            e.preventDefault();

            // Begin Drag Logic
            isDragging = true;
            dragTarget = modalEl;

            // Calculate offset (Mouse Pos - Element Position)
            const rect = modalEl.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;

            // Activate global blocker
            overlayBlocker.style.display = 'block';
            document.body.style.userSelect = 'none'; // Disable text selection globally
        };
    }

    function handleDragMove(e) {
        if (!isDragging || !dragTarget) return;

        e.preventDefault();

        // Calculate new position
        let newX = e.clientX - dragOffset.x;
        let newY = e.clientY - dragOffset.y;

        // Viewport Constraints
        const viewW = window.innerWidth;
        const viewH = window.innerHeight;
        const rect = dragTarget.getBoundingClientRect();

        // Clamp X
        // Allow slight overhang but keep mostly visible
        const margin = 0;
        if (newX < margin) newX = margin;
        if (newX + rect.width > viewW - margin) newX = viewW - rect.width - margin;

        // Clamp Y
        if (newY < margin) newY = margin;
        if (newY + rect.height > viewH - margin) newY = viewH - rect.height - margin;

        // Apply Position directly (optimized)
        // Ensure element is positioned absolute or fixed
        // We assume the modal might be centere initially via Flexbox.
        // To drag properly, we may need to switch to absolute positioning relative to viewport
        // or just rely on the fact that we are moving it.

        // NOTE: If the modal is centered by `display: flex` + `justify-center` on the Overlay,
        // setting `left/top` on the modal might conflict unless we set `position: absolute` or `relative`.
        // The safest strategy for specific positioning usually involves setting `position: absolute`
        // on the modal box itself once drag starts.

        const computedStyle = window.getComputedStyle(dragTarget);
        if (computedStyle.position !== 'absolute' && computedStyle.position !== 'fixed') {
            dragTarget.style.position = 'absolute';
            // We might need to adjust initial left/top if it was static/flex
            // But valid 'newX' and 'newY' are calculated from client coordinates, so they are correct for fixed/absolute.
        }

        dragTarget.style.left = `${newX}px`;
        dragTarget.style.top = `${newY}px`;
        // Remove margins that might interfere if it was centered via margin:auto
        dragTarget.style.margin = '0';
        dragTarget.style.transform = 'none'; // Remove centered transform if any
    }

    function handleDragEnd() {
        if (!isDragging) return;

        isDragging = false;
        dragTarget = null;

        // Deactivate blocker
        overlayBlocker.style.display = 'none';
        document.body.style.userSelect = '';
    }

    /**
     * Standard robust open Function
     * @param {HTMLElement} overlayEl - The overlay covering the screen
     * @param {HTMLElement} modalEl - The actual modal box (for animation reset)
     */
    function openModal(overlayEl, modalEl) {
        if (!overlayEl) return;

        // 1. Reset Position (Optional: re-center)
        if (modalEl) {
            modalEl.style.position = ''; // Revert to CSS default (usually relative/static inside flex container)
            modalEl.style.left = '';
            modalEl.style.top = '';
            modalEl.style.margin = '';
            modalEl.style.transform = ''; // Let CSS animation handle it
        }

        // 2. Force Display
        overlayEl.style.display = 'flex';

        // 3. Trigger Animation
        requestAnimationFrame(() => {
            overlayEl.classList.add('open');
        });
    }

    /**
     * Standard robust close Function
     * @param {HTMLElement} overlayEl 
     */
    function closeModal(overlayEl) {
        if (!overlayEl) return;

        overlayEl.classList.remove('open');

        // Wait for transition (matches CSS duration usually 0.2s)
        setTimeout(() => {
            if (!overlayEl.classList.contains('open')) {
                overlayEl.style.display = 'none';
            }
        }, 250);
    }

    // Init immediately
    init();

    return {
        makeDraggable,
        openModal,
        closeModal
    };
})();

// Expose
window.ModalManager = ModalManager;
