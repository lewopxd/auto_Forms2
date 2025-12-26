/**
 * AutoForms Automation Bar - Fixed control bar at top of page
 * Displays package info, controls, and status
 * Does NOT block page content (adds margin-top to body)
 */

(function () {
    'use strict';

    const ROOT_ID = '__autoforms_bar_root__';
    const BAR_HEIGHT = 50;

    // Prevent duplicate injection
    if (document.getElementById(ROOT_ID)) return;

    // Command queue for Python communication
    window.__autoforms_commands = window.__autoforms_commands || [];

    // State from Python
    window.__autoforms_state = window.__autoforms_state || {
        status: 'idle',
        currentRow: 0,
        totalRows: 0,
        message: 'Listo'
    };

    // Package info (set by Python before injection)
    window.__autoforms_package = window.__autoforms_package || {
        filename: 'Sin paquete',
        totalRows: 0,
        totalQuestions: 0,
        formUrl: ''
    };

    // SVG Icons
    const ICONS = {
        package: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
        rows: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
        questions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
        pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
        stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
    };

    function waitForBody(callback, maxWait = 10000) {
        const start = Date.now();
        (function check() {
            if (document.body) {
                callback();
            } else if (Date.now() - start < maxWait) {
                setTimeout(check, 100);
            }
        })();
    }

    function escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function createAutomationBar() {
        const pkg = window.__autoforms_package;

        // Create fixed bar container
        const host = document.createElement('div');
        host.id = ROOT_ID;
        host.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: ${BAR_HEIGHT}px !important;
            z-index: 2147483647 !important;
        `;

        const shadow = host.attachShadow({ mode: 'closed' });

        shadow.innerHTML = `
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                
                :host {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 13px;
                }
                
                .bar {
                    display: flex;
                    align-items: center;
                    height: ${BAR_HEIGHT}px;
                    background: #ffffff;
                    border-bottom: 1px solid #e5e7eb;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                    padding: 0 16px;
                    gap: 16px;
                }
                
                .section {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .section svg {
                    width: 16px;
                    height: 16px;
                    color: #6b7280;
                    flex-shrink: 0;
                }
                
                .divider {
                    width: 1px;
                    height: 24px;
                    background: #e5e7eb;
                }
                
                .filename {
                    font-weight: 600;
                    color: #1f2937;
                    max-width: 200px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .info-text {
                    color: #6b7280;
                    font-size: 12px;
                }
                
                .info-value {
                    font-weight: 600;
                    color: #374151;
                }
                
                .controls {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                
                .ctrl-btn {
                    width: 32px;
                    height: 32px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s ease;
                }
                
                .ctrl-btn svg {
                    width: 14px;
                    height: 14px;
                }
                
                .ctrl-btn.play {
                    background: #22c55e;
                    color: white;
                }
                .ctrl-btn.play:hover { background: #16a34a; }
                .ctrl-btn.play:disabled { background: #86efac; cursor: not-allowed; }
                
                .ctrl-btn.pause {
                    background: #f59e0b;
                    color: white;
                }
                .ctrl-btn.pause:hover { background: #d97706; }
                
                .ctrl-btn.stop {
                    background: #ef4444;
                    color: white;
                }
                .ctrl-btn.stop:hover { background: #dc2626; }
                
                .status {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0 12px;
                }
                
                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #22c55e;
                }
                
                .status-dot.idle { background: #9ca3af; }
                .status-dot.running { 
                    background: #22c55e;
                    animation: pulse 1.5s infinite;
                }
                .status-dot.paused { background: #f59e0b; }
                .status-dot.error { background: #ef4444; }
                
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                .status-text {
                    color: #374151;
                    font-size: 13px;
                }
                
                .config-btn {
                    width: 32px;
                    height: 32px;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6b7280;
                    transition: all 0.15s ease;
                }
                
                .config-btn:hover {
                    background: #f3f4f6;
                    color: #374151;
                }
            </style>
            
            <div class="bar">
                <!-- Package Name -->
                <div class="section">
                    <span style="color: #667eea;">${ICONS.package}</span>
                    <span class="filename" title="${escHtml(pkg.filename)}">${escHtml(pkg.filename)}</span>
                </div>
                
                <div class="divider"></div>
                
                <!-- Rows Info -->
                <div class="section">
                    ${ICONS.rows}
                    <span class="info-text"><span class="info-value">${pkg.totalRows}</span> filas</span>
                </div>
                
                <!-- Questions Info -->
                <div class="section">
                    ${ICONS.questions}
                    <span class="info-text"><span class="info-value">${pkg.totalQuestions}</span> preguntas</span>
                </div>
                
                <div class="divider"></div>
                
                <!-- Control Buttons -->
                <div class="controls">
                    <button class="ctrl-btn play" id="btnPlay" title="Iniciar">${ICONS.play}</button>
                    <button class="ctrl-btn pause" id="btnPause" title="Pausar">${ICONS.pause}</button>
                    <button class="ctrl-btn stop" id="btnStop" title="Detener">${ICONS.stop}</button>
                </div>
                
                <div class="divider"></div>
                
                <!-- Status -->
                <div class="status">
                    <div class="status-dot idle" id="statusDot"></div>
                    <span class="status-text" id="statusText">Listo</span>
                </div>
                
                <!-- Config Button -->
                <button class="config-btn" id="btnConfig" title="Configuración">
                    ${ICONS.settings}
                </button>
            </div>
        `;

        // Insert bar at top of page
        document.body.insertBefore(host, document.body.firstChild);

        // Add margin-top to body to prevent content overlap
        const originalMargin = parseInt(getComputedStyle(document.body).marginTop) || 0;
        document.body.style.marginTop = (originalMargin + BAR_HEIGHT) + 'px';

        // Get elements from shadow DOM
        const btnPlay = shadow.getElementById('btnPlay');
        const btnPause = shadow.getElementById('btnPause');
        const btnStop = shadow.getElementById('btnStop');
        const btnConfig = shadow.getElementById('btnConfig');
        const statusDot = shadow.getElementById('statusDot');
        const statusText = shadow.getElementById('statusText');

        // Button handlers
        btnPlay.onclick = () => {
            window.__autoforms_commands.push({ type: 'start', time: Date.now() });
        };

        btnPause.onclick = () => {
            window.__autoforms_commands.push({ type: 'pause', time: Date.now() });
        };

        btnStop.onclick = () => {
            window.__autoforms_commands.push({ type: 'stop', time: Date.now() });
        };

        btnConfig.onclick = () => {
            window.__autoforms_commands.push({ type: 'config', time: Date.now() });
        };

        // Update status function (called by Python)
        window.__autoforms_updateStatus = function (status, message) {
            statusDot.className = 'status-dot ' + status;
            statusText.textContent = message || 'Listo';
        };

        // Cleanup function
        window.__autoforms_removeBar = function () {
            const bar = document.getElementById(ROOT_ID);
            if (bar) {
                // Restore body margin
                const currentMargin = parseInt(document.body.style.marginTop) || 0;
                document.body.style.marginTop = Math.max(0, currentMargin - BAR_HEIGHT) + 'px';
                bar.remove();
            }
        };

        console.log('[AutoForms] Automation Bar ready');
        console.log('[AutoForms] Package:', pkg.filename, '|', pkg.totalRows, 'rows |', pkg.totalQuestions, 'questions');
    }

    // Execute
    waitForBody(createAutomationBar);
})();
