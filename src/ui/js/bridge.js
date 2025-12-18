/**
 * FormFlow Bridge - Communication with Python via pywebview
 * This replaces the WebSocket/HTTP approach with direct API calls
 */
(function () {
    'use strict';

    // ========== State ==========
    let isReady = false;
    let pendingCalls = [];
    let messageId = 0;
    const pendingResponses = new Map();
    const TIMEOUT_MS = 30000;

    // Event listeners
    const listeners = {};

    // ========== Core Functions ==========

    /**
     * Send a message to Python and wait for response
     */
    async function send(msg, content = {}) {
        const id = `msg_${++messageId}_${Date.now()}`;

        const payload = JSON.stringify({
            id: id,
            msg: msg,
            content: content
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingResponses.delete(id);
                reject(new Error(`Timeout waiting for ${msg}`));
            }, TIMEOUT_MS);

            pendingResponses.set(id, { resolve, reject, timeout });

            // Call Python
            if (window.pywebview && window.pywebview.api) {
                window.pywebview.api.handle_message(payload).then(responseStr => {
                    clearTimeout(timeout);
                    pendingResponses.delete(id);

                    try {
                        // pywebview may return object directly or JSON string
                        let response = responseStr;
                        if (typeof responseStr === 'string') {
                            response = JSON.parse(responseStr);
                        }

                        if (response.error || response.response === 'error') {
                            reject(new Error(response.content?.error || response.error || 'Unknown error'));
                        } else {
                            resolve(response.content || response);
                        }
                    } catch (e) {
                        // If parsing fails completely, return as-is
                        console.warn('[Bridge] Parse warning:', e);
                        resolve(responseStr);
                    }
                }).catch(err => {
                    clearTimeout(timeout);
                    pendingResponses.delete(id);
                    reject(err);
                });
            } else {
                clearTimeout(timeout);
                reject(new Error('pywebview API not available'));
            }
        });
    }

    /**
     * Initialize the bridge
     */
    async function init() {
        console.log('[Bridge] Initializing...');

        // Wait for pywebview to be ready
        if (!window.pywebview || !window.pywebview.api) {
            console.log('[Bridge] Waiting for pywebview...');
            await new Promise(resolve => {
                window.addEventListener('pywebviewready', resolve, { once: true });
            });
        }

        // Perform handshake
        try {
            const result = await send('handshake', { client: 'FormFlow UI' });
            console.log('[Bridge] Handshake complete:', result);
            isReady = true;
            emit('ready');

            // Process pending calls
            while (pendingCalls.length > 0) {
                const call = pendingCalls.shift();
                call();
            }
        } catch (e) {
            console.error('[Bridge] Handshake failed:', e);
            emit('error', e);
        }
    }

    // ========== Excel Functions ==========

    /**
     * Open file dialog and parse Excel
     */
    async function browseAndParseExcel() {
        try {
            const result = await send('excel_browse_and_parse', {});

            if (result.cancelled) {
                return null;
            }

            if (result.error) {
                throw new Error(result.error);
            }

            emit('excel_loaded', result);
            return result;

        } catch (e) {
            console.error('[Bridge] Excel error:', e);
            throw e;
        }
    }

    /**
     * Parse Excel from path
     */
    async function parseExcel(path, sheet = null) {
        return send('excel_parse', { path, sheet });
    }

    // ========== Window Functions ==========

    function minimize() {
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.minimize();
        }
    }

    function maximize() {
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.maximize();
        }
    }

    function close() {
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.close();
        }
    }

    // ========== Event System ==========

    function on(event, callback) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
    }

    function off(event, callback) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    }

    function emit(event, data) {
        (listeners[event] || []).forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`[Bridge] Event handler error (${event}):`, e);
            }
        });
    }

    // ========== Messages from Python (Push) ==========

    /**
     * Called by Python to send unsolicited messages/events
     */
    function receiveFromPython(message) {
        console.log('[Bridge] Received from Python:', message);

        // Ensure message is object
        if (typeof message === 'string') {
            try { message = JSON.parse(message); } catch (e) { }
        }

        // Emit as local event
        if (message.msg) {
            emit(message.msg, message.content || {});
        }
    }

    // ========== Footer Updates ==========

    function updateFooterExcel(filename, rowCount) {
        const el = document.querySelector('#status-footer .excel-info');
        if (el) {
            if (filename) {
                el.textContent = `${filename} (${rowCount || 0} filas)`;
            } else {
                el.textContent = 'Sin Excel';
            }
        }
    }

    function setStatus(icon, text) {
        const statusIcon = document.getElementById('status-icon');
        const statusText = document.getElementById('status-text');

        if (statusIcon) {
            statusIcon.innerHTML = `<i data-lucide="${icon}" class="text-blue-400"></i>`;
            if (window.lucide) lucide.createIcons();
        }
        if (statusText) {
            statusText.textContent = text;
        }
    }

    // ========== Public API ==========

    window.bridgePy = {
        // Core
        send,
        init,
        isReady: () => isReady,
        receiveFromPython,

        // Excel
        browseAndParseExcel,
        parseExcel,

        // Window
        minimize,
        maximize,
        close,

        // Events
        on,
        off,
        emit,

        // UI Helpers
        updateFooterExcel,
        setStatus
    };

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
