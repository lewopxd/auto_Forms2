/**
 * AutoForms Test Injection Script
 * Shows a handshake card and sets window flag for confirmation.
 */
(function () {
    'use strict';

    // Wait for document.body to exist
    function waitForBody(callback, maxWait) {
        const startTime = Date.now();
        const check = () => {
            if (document.body) {
                callback();
            } else if (Date.now() - startTime < maxWait) {
                setTimeout(check, 100);
            } else {
                console.warn('[AutoForms] Timeout waiting for document.body');
            }
        };
        check();
    }

    function injectCard() {
        // Remove existing card if any
        const existing = document.getElementById('autoforms-handshake-card');
        if (existing) existing.remove();

        // Create handshake card
        const card = document.createElement('div');
        card.id = 'autoforms-handshake-card';
        card.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                color: #fff;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                z-index: 2147483647;
                font-family: system-ui, -apple-system, sans-serif;
                border: 1px solid rgba(255,255,255,0.1);
                min-width: 200px;
            ">
                <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">
                    🤖 AutoForms Automation
                </div>
                <div style="color: #4ecdc4; font-size: 12px;">
                    ✓ Conexión establecida
                </div>
                <div style="color: #888; font-size: 10px; margin-top: 8px;">
                    Script de prueba activo
                </div>
            </div>
        `;
        document.body.appendChild(card);

        // Set handshake flag for Python to detect
        window.__autoforms_handshake = {
            status: 'OK',
            timestamp: Date.now(),
            version: '1.0'
        };

        console.log('[AutoForms] ✓ Handshake card injected');
        console.log('[AutoForms] ✓ window.__autoforms_handshake = OK');
    }

    // Execute with body wait
    waitForBody(injectCard, 10000);
})();
