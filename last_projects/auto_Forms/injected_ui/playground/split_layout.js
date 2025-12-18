/**
 * Playground Split Layout - Preserves MS Forms Design
 * Creates split view by shifting MS Forms to the right without breaking its structure
 */

(function () {
    'use strict';

    const SPLIT_ID = '__msfa_split_layout__';
    const INITIAL_WIDTH = 400; // Initial playground width in pixels

    // Prevent double injection
    if (document.getElementById(SPLIT_ID)) return;

    // Store original body margin
    const originalMarginLeft = document.body.style.marginLeft;

    // Create playground panel (fixed position, left side)
    const playground = document.createElement('div');
    playground.id = SPLIT_ID;
    playground.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: ${INITIAL_WIDTH}px !important;
        height: 100vh !important;
        background: #1e293b !important;
        z-index: 2147483640 !important;
        display: flex !important;
        flex-direction: column !important;
        box-shadow: 2px 0 10px rgba(0,0,0,0.3) !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    `;

    // Playground content
    playground.innerHTML = `
        <div style="padding: 16px; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">📊</span>
            <span style="color: white; font-weight: 600; font-size: 14px;">Playground</span>
        </div>
        <div style="flex: 1; padding: 16px; overflow-y: auto; color: #94a3b8; font-size: 13px;">
            <p style="margin: 0 0 12px 0;">Panel izquierdo funcionando.</p>
            <div style="padding: 12px; background: #334155; border-radius: 6px; font-size: 12px;">
                <p style="margin: 0 0 6px 0; color: #64748b;">✓ MS Forms visible a la derecha</p>
                <p style="margin: 0 0 6px 0; color: #64748b;">✓ Diseño del formulario intacto</p>
                <p style="margin: 0; color: #64748b;">✓ Arrastra el borde para redimensionar</p>
            </div>
        </div>
    `;

    // Create resizer handle
    const resizer = document.createElement('div');
    resizer.id = '__msfa_resizer__';
    resizer.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: ${INITIAL_WIDTH}px !important;
        width: 6px !important;
        height: 100vh !important;
        background: #475569 !important;
        cursor: col-resize !important;
        z-index: 2147483641 !important;
        transition: background 0.2s !important;
    `;
    resizer.innerHTML = `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 2px; height: 30px; background: #94a3b8; border-radius: 1px;"></div>`;

    // Insert elements
    document.body.appendChild(playground);
    document.body.appendChild(resizer);

    // Shift MS Forms content to the right (preserve original structure)
    document.body.style.marginLeft = (INITIAL_WIDTH + 6) + 'px';
    document.body.style.transition = 'margin-left 0.1s ease';

    // Resize logic
    let isResizing = false;
    let currentWidth = INITIAL_WIDTH;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.style.background = '#667eea';
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const newWidth = Math.min(Math.max(200, e.clientX), window.innerWidth - 400);
        currentWidth = newWidth;

        playground.style.width = newWidth + 'px';
        resizer.style.left = newWidth + 'px';
        document.body.style.marginLeft = (newWidth + 6) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.style.background = '#475569';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });

    // Hover effects
    resizer.addEventListener('mouseenter', () => {
        if (!isResizing) resizer.style.background = '#64748b';
    });
    resizer.addEventListener('mouseleave', () => {
        if (!isResizing) resizer.style.background = '#475569';
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        if (currentWidth > window.innerWidth - 400) {
            currentWidth = Math.max(200, window.innerWidth - 400);
            playground.style.width = currentWidth + 'px';
            resizer.style.left = currentWidth + 'px';
            document.body.style.marginLeft = (currentWidth + 6) + 'px';
        }
    });

    console.log('[MSFA] Split layout injected - MS Forms design preserved');
})();
