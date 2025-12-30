/**
 * AutoForms Automation Bar - Fixed control bar at top of page
 * Displays package info, controls, and status
 * Does NOT block page content (adds margin-top to body)
 */

(function () {
    'use strict';

    const ROOT_ID = '__autoforms_bar_root__';
    const BAR_HEIGHT = 36;

    // Prevent duplicate injection
    if (document.getElementById(ROOT_ID)) return;

    // ═══════════════════════════════════════════════════════════════════════
    // ESTADO Y CONFIGURACIÓN DE LA UI INYECTADA
    // ═══════════════════════════════════════════════════════════════════════
    window.__autoforms_config = window.__autoforms_config || {
        // Columnas de control seleccionadas (máximo 3)
        controlColumns: [],  // Array de { key: 'q4', text: 'Nombre del beneficiario' }

        // Estado actual de la automatización
        currentRowIndex: 0,
        isRunning: false,
        isPaused: false,

        // Selección de filas para procesar
        selectedRows: [],  // Array de índices de filas seleccionadas

        // Resultados de automatización por fila
        // { 0: { submitSuccess: true, linkCaptured: true, url: '...', error: null }, ... }
        rowResults: {},

        // Dropdown state
        dropdownOpen: null,  // 'config' | 'rows' | null
    };

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
        formUrl: '',
        instructions: { pages: [] },
        resolvedRows: []
    };

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Extrae todas las preguntas del paquete para el selector de columnas
     */
    function getAllQuestions() {
        const pkg = window.__autoforms_package;
        const questions = [];

        if (pkg.instructions && pkg.instructions.pages) {
            pkg.instructions.pages.forEach(page => {
                if (page.questions) {
                    page.questions.forEach(q => {
                        questions.push({
                            key: q.key,
                            text: q.text || q.key,
                            type: q.type || 'text'
                        });
                    });
                }
            });
        }

        // Fallback: si no hay instructions, intentar extraer de resolvedRows
        if (questions.length === 0 && pkg.resolvedRows && pkg.resolvedRows.length > 0) {
            const firstRow = pkg.resolvedRows[0];
            if (firstRow.answers) {
                Object.keys(firstRow.answers).forEach(key => {
                    questions.push({ key, text: key, type: 'text' });
                });
            }
        }

        return questions;
    }

    /**
     * Obtiene el valor de una fila para las columnas de control
     */
    function getRowControlValues(rowData) {
        const config = window.__autoforms_config;
        const values = [];

        config.controlColumns.forEach(col => {
            const value = rowData.answers ? rowData.answers[col.key] : '';
            // Truncar valores largos
            const truncated = value && value.length > 25 ? value.substring(0, 22) + '...' : value;
            values.push(truncated || '—');
        });

        return values;
    }

    // SVG Icons
    const ICONS = {
        package: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
        rows: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
        questions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        play: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
        pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
        stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
        next: `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><rect x="15" y="4" width="4" height="16"/></svg>`,
        one: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="12" y1="8" x2="9" y2="11"/></svg>`,
        loop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
        check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
        expand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`,
        collapse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>`
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

    // ═══════════════════════════════════════════════════════════════════════
    // CREAR LA BARRA DE AUTOMATIZACIÓN
    // ═══════════════════════════════════════════════════════════════════════

    function createAutomationBar() {
        const pkg = window.__autoforms_package;
        const config = window.__autoforms_config;

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
                    font-size: 11px;
                }
                
                .bar {
                    display: flex;
                    align-items: center;
                    height: ${BAR_HEIGHT}px;
                    background: #f3f4f6;
                    border-bottom: 1px solid #e5e7eb;
                    padding: 0 12px;
                    gap: 10px;
                }
                
                .section {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    position: relative;
                }
                
                .section svg {
                    width: 14px;
                    height: 14px;
                    color: #6b7280;
                    flex-shrink: 0;
                }
                
                .divider {
                    width: 1px;
                    height: 20px;
                    background: #d1d5db;
                }
                
                .filename {
                    font-size: 11px;
                    font-weight: 500;
                    color: #374151;
                    max-width: 180px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .info-btn {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    height: 24px;
                    padding: 0 8px;
                    border: 1px solid #d1d5db;
                    border-radius: 3px;
                    background: white;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    color: #374151;
                    font-size: 11px;
                    font-weight: 500;
                }
                
                .info-btn:hover {
                    background: #e5e7eb;
                    border-color: #9ca3af;
                }
                
                .info-btn.active {
                    background: #667eea;
                    border-color: #667eea;
                    color: white;
                }
                
                .info-btn svg {
                    width: 12px;
                    height: 12px;
                }
                
                .info-value {
                    font-weight: 600;
                }
                
                .controls {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }
                
                .ctrl-btn {
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s ease;
                }
                
                .ctrl-btn svg {
                    width: 12px;
                    height: 12px;
                }
                
                .ctrl-btn.play-pause {
                    background: #22c55e;
                    color: white;
                }
                .ctrl-btn.play-pause:hover { background: #16a34a; }
                .ctrl-btn.play-pause.paused {
                    background: #f59e0b;
                }
                .ctrl-btn.play-pause.paused:hover { background: #d97706; }
                
                .ctrl-btn.stop {
                    background: #ef4444;
                    color: white;
                }
                .ctrl-btn.stop:hover { background: #dc2626; }
                
                .ctrl-btn.next {
                    background: #3b82f6;
                    color: white;
                }
                .ctrl-btn.next:hover { background: #2563eb; }
                
                .ctrl-btn.hidden {
                    display: none;
                }
                
                .mode-btn {
                    width: 24px;
                    height: 24px;
                    border: none;
                    border-radius: 3px;
                    background: #f97316;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    transition: all 0.15s ease;
                }
                
                .mode-btn svg {
                    width: 12px;
                    height: 12px;
                }
                
                .mode-btn:hover {
                    background: #ea580c;
                }
                
                .mode-btn.active {
                    background: #6b7280;
                }
                
                .status {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 0 8px;
                }
                
                .status-dot {
                    width: 6px;
                    height: 6px;
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
                    font-size: 11px;
                }
                
                .config-btn {
                    width: 24px;
                    height: 24px;
                    border: 1px solid #d1d5db;
                    border-radius: 3px;
                    background: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6b7280;
                    transition: all 0.15s ease;
                }
                
                .config-btn svg {
                    width: 12px;
                    height: 12px;
                }
                
                .config-btn:hover {
                    background: #e5e7eb;
                    color: #374151;
                }
                
                /* ═══════════════════════════════════════════════════════════
                   DROPDOWN STYLES
                   ═══════════════════════════════════════════════════════════ */
                
                .dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    z-index: 1000;
                    min-width: 320px;
                    max-height: 400px;
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                }
                
                .dropdown.open {
                    display: flex;
                }
                
                .dropdown-header {
                    padding: 16px;
                    border-bottom: 1px solid #e5e7eb;
                    background: #f9fafb;
                }
                
                .dropdown-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #1f2937;
                    margin-bottom: 4px;
                }
                
                .dropdown-subtitle {
                    font-size: 11px;
                    color: #6b7280;
                    line-height: 1.4;
                }
                
                .dropdown-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px;
                }
                
                .dropdown-content::-webkit-scrollbar {
                    width: 6px;
                }
                
                .dropdown-content::-webkit-scrollbar-track {
                    background: #f1f5f9;
                }
                
                .dropdown-content::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 3px;
                }
                
                .dropdown-footer {
                    padding: 12px 16px;
                    border-top: 1px solid #e5e7eb;
                    background: #f9fafb;
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                }
                
                .dropdown-btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    border: none;
                }
                
                .dropdown-btn-primary {
                    background: #667eea;
                    color: white;
                }
                
                .dropdown-btn-primary:hover {
                    background: #5a67d8;
                }
                
                .dropdown-btn-secondary {
                    background: white;
                    border: 1px solid #e5e7eb;
                    color: #374151;
                }
                
                .dropdown-btn-secondary:hover {
                    background: #f9fafb;
                }
                
                /* ═══════════════════════════════════════════════════════════
                   CHECKBOX LIST (para selector de columnas)
                   ═══════════════════════════════════════════════════════════ */
                
                .checkbox-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 12px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.1s ease;
                }
                
                .checkbox-item:hover {
                    background: #f3f4f6;
                }
                
                .checkbox-item.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .checkbox {
                    width: 18px;
                    height: 18px;
                    border: 2px solid #d1d5db;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s ease;
                    flex-shrink: 0;
                }
                
                .checkbox.checked {
                    background: #667eea;
                    border-color: #667eea;
                }
                
                .checkbox svg {
                    width: 12px;
                    height: 12px;
                    color: white;
                    display: none;
                }
                
                .checkbox.checked svg {
                    display: block;
                }
                
                .checkbox-label {
                    flex: 1;
                    font-size: 13px;
                    color: #374151;
                    line-height: 1.3;
                }
                
                .checkbox-key {
                    font-size: 11px;
                    color: #9ca3af;
                    font-family: monospace;
                }
                
                /* ═══════════════════════════════════════════════════════════
                   ROWS LIST - Ahora es una MODAL centrada
                   ═══════════════════════════════════════════════════════════ */
                
                .rows-dropdown {
                    /* Modal overlay completa */
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    width: 100vw !important;
                    height: 100vh !important;
                    background: rgba(0, 0, 0, 0.5) !important;
                    backdrop-filter: blur(3px);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 99999 !important;
                    padding: 20px;
                    box-sizing: border-box;
                }
                
                .rows-dropdown.open {
                    display: flex !important;
                }
                
                .rows-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                
                .row-item {
                    display: grid;
                    gap: 8px;
                    padding: 10px 12px;
                    border-radius: 6px;
                    background: #f9fafb;
                    cursor: pointer;
                    transition: all 0.1s ease;
                    align-items: center;
                }
                
                .row-item:hover {
                    background: #e0e7ff;
                }
                
                .row-item.current {
                    background: #667eea;
                    color: white;
                }
                
                .row-item.current .row-value {
                    color: rgba(255,255,255,0.9);
                }
                
                .row-item.completed {
                    background: #dcfce7;
                }
                
                .row-index {
                    width: 36px;
                    height: 24px;
                    background: #667eea;
                    color: white;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                
                .row-item.current .row-index {
                    background: white;
                    color: #667eea;
                }
                
                .row-value {
                    font-size: 12px;
                    color: #374151;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .config-link {
                    padding: 16px;
                    text-align: center;
                    color: #667eea;
                    font-size: 13px;
                    cursor: pointer;
                }
                
                .config-link:hover {
                    text-decoration: underline;
                }
                
                .view-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s ease;
                    flex-shrink: 0;
                }
                
                .view-btn:hover {
                    background: rgba(102, 126, 234, 0.15);
                }
                
                .view-btn svg {
                    width: 16px;
                    height: 16px;
                    color: #667eea;
                }
                
                .row-item.current .view-btn svg {
                    color: white;
                }
                
                /* ═══════════════════════════════════════════════════════════
                   ROWS MODAL - Tabla compacta con estados
                   ═══════════════════════════════════════════════════════════ */
                
                .rm-modal-container {
                    display: flex;
                    flex-direction: column;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
                    width: 90%;
                    max-width: 900px;
                    height: 80%;
                    max-height: 600px;
                    overflow: hidden;
                }
                
                .rm-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 8px 8px 0 0;
                }
                
                .rm-header-left {
                    flex: 1;
                }
                
                .rm-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: white;
                }
                
                .rm-subtitle {
                    display: flex;
                    gap: 12px;
                    margin-top: 4px;
                    font-size: 11px;
                    color: rgba(255,255,255,0.85);
                }
                
                .rm-stat {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                }
                
                .rm-stat-completed { color: #86efac; }
                .rm-stat-error { color: #fca5a5; }
                .rm-stat-pending { color: #d1d5db; }
                
                .rm-close-btn {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: rgba(255,255,255,0.2);
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .rm-close-btn:hover {
                    background: rgba(255,255,255,0.3);
                }
                
                .rm-close-btn svg {
                    width: 14px;
                    height: 14px;
                    color: white;
                }
                
                .rm-toolbar {
                    padding: 8px 12px;
                    background: #f3f4f6;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .rm-select-all-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    color: #374151;
                    cursor: pointer;
                }
                
                .rm-table-container {
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: auto;
                }
                
                .rm-table-container::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                
                .rm-table-container::-webkit-scrollbar-track {
                    background: #f1f5f9;
                }
                
                .rm-table-container::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 3px;
                }
                
                .rm-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                
                .rm-th {
                    padding: 6px 8px;
                    text-align: left;
                    font-weight: 600;
                    color: #667eea;
                    background: #e0e7ff;
                    position: sticky;
                    top: 0;
                    z-index: 1;
                    white-space: nowrap;
                }
                
                .rm-th-check, .rm-th-action { width: 32px; text-align: center; }
                .rm-th-num { width: 36px; text-align: center; }
                .rm-th-status { width: 28px; text-align: center; }
                .rm-th-link { width: 40px; text-align: center; }
                
                .rm-row {
                    transition: background 0.1s ease;
                }
                
                .rm-row:hover {
                    filter: brightness(0.97);
                }
                
                .rm-row-current {
                    font-weight: 600;
                }
                
                .rm-td {
                    padding: 6px 8px;
                    border-bottom: 1px solid #e5e7eb;
                    vertical-align: middle;
                }
                
                .rm-td-check, .rm-td-action { text-align: center; }
                
                .rm-td-num {
                    text-align: center;
                    font-weight: 600;
                    color: #667eea;
                    cursor: pointer;
                }
                
                .rm-td-num:hover {
                    text-decoration: underline;
                }
                
                .rm-current {
                    background: #667eea !important;
                    color: white !important;
                    border-radius: 4px;
                }
                
                .rm-td-value {
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                
                .rm-td-status {
                    text-align: center;
                }
                
                .rm-td-status svg {
                    display: inline-block;
                    vertical-align: middle;
                }
                
                .rm-td-link {
                    text-align: center;
                }
                
                .rm-link {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 4px;
                    border-radius: 4px;
                    transition: background 0.15s ease;
                }
                
                .rm-link:hover {
                    background: rgba(59, 130, 246, 0.15);
                }
                
                .rm-checkbox-label {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                
                .rm-checkbox {
                    width: 14px;
                    height: 14px;
                    accent-color: #667eea;
                }
                
                .rm-view-btn {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: transparent;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .rm-view-btn:hover {
                    background: rgba(102, 126, 234, 0.15);
                }
                
                .rm-view-btn svg {
                    width: 14px;
                    height: 14px;
                    color: #667eea;
                }
                
                .rm-footer {
                    display: flex;
                    gap: 8px;
                    padding: 10px 12px;
                    background: #f9fafb;
                    border-top: 1px solid #e5e7eb;
                    border-radius: 0 0 8px 8px;
                }
                
                .rm-btn {
                    flex: 1;
                    padding: 8px 12px;
                    border: none;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                
                .rm-btn-export {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                }
                
                .rm-btn-export:hover {
                    filter: brightness(1.05);
                }
                
                .rm-btn-secondary {
                    background: #e5e7eb;
                    color: #374151;
                }
                
                .rm-btn-secondary:hover {
                    background: #d1d5db;
                }
                
                .rm-btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                
                .rm-btn-primary:hover {
                    filter: brightness(1.05);
                }
                
                /* ═══════════════════════════════════════════════════════════
                   MODAL DE VISTA DE FORMULARIO
                   ═══════════════════════════════════════════════════════════ */
                
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(2px);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                
                .modal-overlay.visible {
                    display: flex;
                }
                
                .modal {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
                    width: 520px;
                    max-width: 90vw;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                
                .modal-header {
                    padding: 14px 18px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    display: flex;
                    align-items: center;
                }
                
                .modal-title {
                    flex: 1;
                    font-size: 14px;
                    font-weight: 600;
                    color: white;
                }
                
                .modal-subtitle {
                    font-size: 11px;
                    color: rgba(255,255,255,0.8);
                    margin-top: 2px;
                }
                
                .modal-close {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-left: 16px;
                    flex-shrink: 0;
                }
                
                .modal-close:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
                
                .modal-close svg {
                    width: 14px;
                    height: 14px;
                    color: white;
                }
                
                .modal-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px 24px;
                }
                
                .modal-content::-webkit-scrollbar {
                    width: 6px;
                }
                
                .modal-content::-webkit-scrollbar-track {
                    background: #f1f5f9;
                }
                
                .modal-content::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 3px;
                }
                
                .page-section {
                    margin-bottom: 12px;
                }
                
                .page-header {
                    font-size: 11px;
                    font-weight: 600;
                    color: #667eea;
                    margin-bottom: 8px;
                    padding-bottom: 4px;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .page-question {
                    display: flex;
                    gap: 8px;
                    padding: 6px 0;
                    border-bottom: 1px solid #f1f5f9;
                }
                
                .page-question:last-child {
                    border-bottom: none;
                }
                
                .page-question-num {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 20px;
                    height: 20px;
                    background: #667eea;
                    color: white;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    flex-shrink: 0;
                }
                
                .page-question-content {
                    flex: 1;
                    min-width: 0;
                }
                
                .page-question-text {
                    font-size: 12px;
                    color: #374151;
                    line-height: 1.4;
                    margin-bottom: 4px;
                }
                
                .page-answer {
                    font-size: 12px;
                    color: #1e293b;
                    font-weight: 500;
                }
                
                .page-answer.collapsed {
                    max-height: 60px;
                    overflow: hidden;
                    position: relative;
                }
                
                .page-answer.collapsed::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 20px;
                    background: linear-gradient(transparent, white);
                }
                
                .expand-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 6px;
                    margin-top: 4px;
                    background: #f1f5f9;
                    border: none;
                    border-radius: 4px;
                    font-size: 10px;
                    color: #667eea;
                    cursor: pointer;
                }
                
                .expand-btn:hover {
                    background: #e2e8f0;
                }
                
                .expand-btn svg {
                    width: 12px;
                    height: 12px;
                }
                
                .page-options {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                
                .page-option {
                    font-size: 11px;
                    color: #94a3b8;
                    padding: 2px 0;
                }
                
                .page-option.selected {
                    color: #059669;
                    font-weight: 600;
                }
                
                .page-option.selected::before {
                    content: '✓ ';
                }
                
                /* ═══════════════════════════════════════════════════════════
                   TARJETAS DE ACCIÓN (rediseño: círculo en header, drag, colapso)
                   ═══════════════════════════════════════════════════════════ */
                
                .action-container {
                    position: fixed;
                    top: 60px;
                    right: 16px;
                    z-index: 9999;
                }
                
                .action-wrapper {
                    position: absolute;
                    top: 0;
                    right: 0;
                    opacity: 0;
                    transform: translateY(50px);
                    pointer-events: none;
                    transition: opacity 0.3s ease-out, transform 0.3s ease-out;
                }
                
                .action-wrapper.visible {
                    opacity: 1;
                    transform: translateY(0);
                    pointer-events: auto;
                }
                
                .action-wrapper.exiting {
                    opacity: 0;
                    transform: translateY(-50px);
                    pointer-events: none;
                }
                
                .action-wrapper.dragging {
                    transition: none !important;
                    user-select: none;
                }
                
                .action-wrapper.collapsed .action-card-body,
                .action-wrapper.collapsed .action-card-header-content {
                    display: none !important;
                }
                
                .action-wrapper.collapsed .action-card {
                    width: auto !important;
                    min-width: 0 !important;
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                }
                
                /* Tarjeta */
                .action-card {
                    width: 200px;
                    min-width: 180px;
                    max-width: 400px;
                    background: white;
                    border-radius: 8px;
                    border: 1px solid #d1d5db;
                    border-left-width: 3px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    overflow: visible;
                    display: flex;
                    flex-direction: column;
                    resize: horizontal;
                }
                
                .action-card.fill { border-left-color: #3b82f6; }
                .action-card.select { border-left-color: #8b5cf6; }
                .action-card.click { border-left-color: #f97316; }
                
                .action-card-header {
                    display: flex;
                    align-items: center;
                    padding: 6px 10px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    gap: 8px;
                    position: relative;
                }
                
                .action-card-header-content {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .action-type-chip {
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 9px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                
                .action-type-chip.fill { background: #dbeafe; color: #1e40af; }
                .action-type-chip.select { background: #ede9fe; color: #5b21b6; }
                .action-type-chip.click { background: #ffedd5; color: #c2410c; }
                
                /* Círculo indicador (ahora en el header, esquina derecha) */
                .action-indicator {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    border: 3px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    font-weight: 700;
                    color: #6b7280;
                    background: white;
                    flex-shrink: 0;
                    position: relative;
                    cursor: grab;
                    user-select: none;
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                }
                
                .action-indicator:hover {
                    transform: scale(1.08);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                }
                
                .action-indicator:active {
                    cursor: grabbing;
                    transform: scale(0.95);
                }
                
                /* Colores por tipo (anillo estático) */
                .action-indicator.fill { border-color: #93c5fd; color: #3b82f6; }
                .action-indicator.select { border-color: #c4b5fd; color: #8b5cf6; }
                .action-indicator.click { border-color: #fdba74; color: #f97316; }
                
                /* Estado: Loading - spinner girando (solo el pseudo-elemento gira) */
                .action-indicator.loading::before {
                    content: '';
                    position: absolute;
                    top: -3px;
                    left: -3px;
                    right: -3px;
                    bottom: -3px;
                    border-radius: 50%;
                    border: 3px solid transparent;
                    border-top-color: currentColor;
                    border-right-color: currentColor;
                    animation: spinnerRotate 0.8s linear infinite;
                }
                
                @keyframes spinnerRotate {
                    to { transform: rotate(360deg); }
                }
                
                /* Estado: Success */
                .action-indicator.success {
                    border-color: #22c55e;
                    color: #22c55e;
                }
                
                .action-indicator.success svg {
                    width: 14px;
                    height: 14px;
                }
                
                /* Estado: Error */
                .action-indicator.error {
                    border-color: #ef4444;
                    color: #ef4444;
                }
                
                .action-indicator.error svg {
                    width: 14px;
                    height: 14px;
                }
                
                .action-indicator svg {
                    width: 12px;
                    height: 12px;
                }
                
                .action-card-body {
                    padding: 10px;
                    max-height: 200px;
                    overflow-y: auto;
                }
                
                .action-question {
                    font-size: 12px;
                    font-weight: 600;
                    color: #1f2937;
                    line-height: 1.3;
                    margin-bottom: 6px;
                }
                
                .action-answer {
                    font-size: 11px;
                    color: #059669;
                    background: #ecfdf5;
                    padding: 6px 8px;
                    border-radius: 4px;
                    border: 1px solid #a7f3d0;
                }
                
                .action-options {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }
                
                .action-opt {
                    font-size: 10px;
                    padding: 3px 6px;
                    border-radius: 3px;
                    color: #6b7280;
                    background: #f3f4f6;
                }
                
                .action-opt.selected {
                    background: #8b5cf6;
                    color: white;
                    font-weight: 600;
                }
                
                .action-selector {
                    font-size: 10px;
                    padding: 5px 6px;
                    background: #fff7ed;
                    border: 1px dashed #f97316;
                    border-radius: 3px;
                    color: #c2410c;
                    font-family: monospace;
                }
                
                /* Resize handles */
                .action-resize-left, .action-resize-right {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 8px;
                    cursor: ew-resize;
                    z-index: 10;
                }
                .action-resize-left { left: -4px; }
                .action-resize-right { right: -4px; }

                .action-resize-bottom {
                    position: absolute;
                    bottom: -4px;
                    left: 0;
                    right: 0;
                    height: 8px;
                    cursor: ns-resize;
                    z-index: 10;
                }

                .action-resize-bottom-left, .action-resize-bottom-right {
                    position: absolute;
                    bottom: -4px;
                    width: 12px;
                    height: 12px;
                    z-index: 11;
                }
                .action-resize-bottom-left { 
                    left: -4px; 
                    cursor: nesw-resize;
                }
                .action-resize-bottom-right { 
                    right: -4px; 
                    cursor: nwse-resize;
                }
                
                .action-resize-left:hover, .action-resize-right:hover,
                .action-resize-bottom:hover,
                .action-resize-bottom-left:hover, .action-resize-bottom-right:hover {
                    background: rgba(102, 126, 234, 0.3);
                }
                
                /* ═══════════════════════════════════════════════════════════
                   PANEL DE PRUEBA (derecha)
                   ═══════════════════════════════════════════════════════════ */
                
                .test-panel {
                    position: fixed;
                    top: 60px;
                    right: 16px;
                    width: 200px;
                    background: white;
                    border-radius: 8px;
                    border: 1px solid #d1d5db;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                    z-index: 9998;
                    display: none;
                }
                
                .test-panel.visible {
                    display: block;
                }
                
                .test-panel-header {
                    padding: 10px 12px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    font-size: 11px;
                    font-weight: 600;
                    color: #374151;
                    text-transform: uppercase;
                }
                
                .test-panel-list {
                    max-height: 300px;
                    overflow-y: auto;
                }
                
                .test-action-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    cursor: pointer;
                    border-bottom: 1px solid #f3f4f6;
                    font-size: 12px;
                    transition: background 0.1s;
                }
                
                .test-action-item:hover {
                    background: #f3f4f6;
                }
                
                .test-action-item:last-child {
                    border-bottom: none;
                }
                
                .test-action-num {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    font-weight: 600;
                    color: white;
                    flex-shrink: 0;
                }
                
                .test-action-num.fill { background: #3b82f6; }
                .test-action-num.select { background: #8b5cf6; }
                .test-action-num.click { background: #f97316; }
                
                .test-action-text {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #374151;
                }
                
                /* ═══════════════════════════════════════════════════════════
                   CONFIG MODAL
                   ═══════════════════════════════════════════════════════════ */
                
                .config-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                
                .config-modal-overlay.open {
                    display: flex;
                }
                
                .config-modal {
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                    width: 360px;
                    max-width: 90vw;
                }
                
                .config-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .config-modal-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: #1f2937;
                }
                
                .config-modal-close {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    color: #6b7280;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .config-modal-close:hover { color: #374151; }
                
                .config-modal-close svg {
                    width: 16px;
                    height: 16px;
                }
                
                .config-modal-body {
                    padding: 16px;
                }
                
                .config-field {
                    margin-bottom: 16px;
                }
                
                .config-field:last-child {
                    margin-bottom: 0;
                }
                
                .config-label {
                    display: block;
                    font-size: 11px;
                    font-weight: 500;
                    color: #6b7280;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                
                .config-input {
                    width: 100%;
                    height: 32px;
                    padding: 0 10px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 12px;
                    color: #374151;
                    outline: none;
                }
                
                .config-input:focus {
                    border-color: #667eea;
                    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
                }
                
                .config-row {
                    display: flex;
                    gap: 10px;
                }
                
                .config-row .config-input {
                    flex: 1;
                }
                
                .config-checkbox-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                }
                
                .config-checkbox {
                    width: 16px;
                    height: 16px;
                    border: 1px solid #d1d5db;
                    border-radius: 3px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: white;
                    flex-shrink: 0;
                }
                
                .config-checkbox.checked {
                    background: #667eea;
                    border-color: #667eea;
                }
                
                .config-checkbox svg {
                    width: 10px;
                    height: 10px;
                    color: white;
                }
                
                .config-checkbox-label {
                    font-size: 12px;
                    color: #374151;
                }
                
                .config-input-group {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .config-input-label {
                    font-size: 11px;
                    font-weight: 500;
                    color: #6b7280;
                    min-width: 28px;
                }
                
                .config-unit {
                    font-size: 11px;
                    color: #9ca3af;
                    font-weight: 500;
                }
                
                .config-modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    padding: 14px 16px;
                    border-top: 1px solid #e5e7eb;
                }
                
                .config-btn {
                    height: 32px;
                    min-width: 80px;
                    padding: 0 16px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    white-space: nowrap;
                }
                
                .config-btn-cancel {
                    background: white;
                    border: 1px solid #d1d5db;
                    color: #374151;
                }
                
                .config-btn-cancel:hover {
                    background: #f3f4f6;
                }
                
                .config-btn-save {
                    background: #667eea;
                    border: none;
                    color: white;
                }
                
                .config-btn-save:hover {
                    background: #5a6fd6;
                }
                
                /* ═══ New: Config Sections ═══ */
                .config-section {
                    margin-bottom: 8px;
                }
                
                .config-section-title {
                    font-size: 11px;
                    font-weight: 600;
                    color: #4b5563;
                    margin-bottom: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                
                .config-divider {
                    border-top: 1px solid #e5e7eb;
                    margin: 14px 0;
                }
                
                .config-subsection {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    padding: 10px;
                    margin-bottom: 10px;
                }
                
                .config-subsection-title {
                    font-size: 10px;
                    font-weight: 600;
                    color: #6b7280;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                }
                
                .config-select {
                    width: 100%;
                    height: 30px;
                    padding: 0 8px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #374151;
                    background: white;
                    cursor: pointer;
                    outline: none;
                }
                
                .config-select:focus {
                    border-color: #667eea;
                    box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
                }
                
                .config-method-options {
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px dashed #e5e7eb;
                }
                
                .config-inline-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 6px;
                }
                
                .config-inline-group .config-input {
                    width: 70px;
                    height: 26px;
                    font-size: 11px;
                }
            </style>
            
            <div class="bar">
                <!-- Package Name -->
                <div class="section">
                    <span style="color: #667eea;">${ICONS.package}</span>
                    <span class="filename" title="${escHtml(pkg.filename)}">${escHtml(pkg.filename)}</span>
                </div>
                
                <div class="divider"></div>
                
                <!-- Rows Info (Clickable) -->
                <div class="section" id="rowsSection">
                    <button class="info-btn" id="btnRows">
                        ${ICONS.rows}
                        <span><span class="info-value">${pkg.totalRows}</span> filas</span>
                    </button>
                    
                    <!-- Dropdown: Selector de columnas O Lista de filas -->
                    <div class="dropdown" id="rowsDropdown"></div>
                </div>
                
                <!-- Modal de vista de formulario -->
                <div class="modal-overlay" id="formModalOverlay">
                    <div class="modal" id="formModal">
                        <div class="modal-header">
                            <div>
                                <div class="modal-title" id="modalTitle">Formulario Fila #1</div>
                                <div class="modal-subtitle" id="modalSubtitle">21 preguntas</div>
                            </div>
                            <button class="modal-close" id="modalClose">${ICONS.close}</button>
                        </div>
                        <div class="modal-content" id="modalContent"></div>
                    </div>
                </div>
                
                <!-- Questions Info (Clickable) -->
                <div class="section" id="questionsSection">
                    <button class="info-btn" id="btnQuestions">
                        ${ICONS.questions}
                        <span><span class="info-value">${pkg.totalQuestions}</span> preguntas</span>
                    </button>
                    
                    <!-- Dropdown: Lista de preguntas -->
                    <div class="dropdown" id="questionsDropdown"></div>
                </div>
                
                <div class="divider"></div>
                
                <!-- Control Buttons -->
                <div class="controls">
                    <button class="ctrl-btn play-pause" id="btnPlayPause" title="Iniciar">${ICONS.play}</button>
                    <button class="ctrl-btn stop" id="btnStop" title="Detener">${ICONS.stop}</button>
                    <button class="ctrl-btn next hidden" id="btnNext" title="Siguiente fila">${ICONS.next}</button>
                </div>
                
                <div class="divider"></div>
                
                <!-- Mode Toggle: Uno a uno vs Todas -->
                <button class="mode-btn" id="btnMode" title="Modo: Todas las filas">
                    ${ICONS.loop}
                </button>
                
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
            
            <!-- Modal de Configuración -->
            <div class="config-modal-overlay" id="configModalOverlay">
                <div class="config-modal" style="width: 480px;">
                    <div class="config-modal-header">
                        <span class="config-modal-title">⚙️ Configuración de Automatización</span>
                        <button class="config-modal-close" id="configModalClose">${ICONS.close}</button>
                    </div>
                    <div class="config-modal-body" style="max-height: 500px; overflow-y: auto;">
                        
                        <!-- ═══ SECCIÓN 1: Tiempos Globales ═══ -->
                        <div class="config-section">
                            <div class="config-section-title">⏱️ Tiempos Globales</div>
                            
                            <!-- Tiempo entre filas -->
                            <div class="config-subsection">
                                <div class="config-subsection-title">Tiempo entre filas (formularios)</div>
                                <div class="config-checkbox-row" id="randomDelayToggle">
                                    <div class="config-checkbox" id="randomDelayCheckbox">${ICONS.check}</div>
                                    <span class="config-checkbox-label">Delay aleatorio</span>
                                </div>
                                <div class="config-field" id="fixedDelayField" style="margin-top: 8px;">
                                    <div class="config-input-group">
                                        <label class="config-input-label">Fijo:</label>
                                        <input type="number" class="config-input" id="delayInput" value="2000" min="0" step="100" style="width: 80px;">
                                        <span class="config-unit">ms</span>
                                    </div>
                                </div>
                                <div class="config-field" id="randomDelayField" style="display: none; margin-top: 8px;">
                                    <div class="config-row">
                                        <div class="config-input-group">
                                            <label class="config-input-label">Min</label>
                                            <input type="number" class="config-input" id="delayMinInput" value="1000" min="0" step="100" style="width: 70px;">
                                            <span class="config-unit">ms</span>
                                        </div>
                                        <div class="config-input-group">
                                            <label class="config-input-label">Max</label>
                                            <input type="number" class="config-input" id="delayMaxInput" value="3000" min="0" step="100" style="width: 70px;">
                                            <span class="config-unit">ms</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="config-divider"></div>
                        
                        <!-- ═══ SECCIÓN 2: Human Actions ═══ -->
                        <div class="config-section">
                            <div class="config-section-title">🤖 Human Actions (Anti-bot)</div>
                            <div class="config-checkbox-row" id="humanActionsToggle">
                                <div class="config-checkbox checked" id="humanActionsCheckbox">${ICONS.check}</div>
                                <span class="config-checkbox-label">Habilitar acciones humanas</span>
                            </div>
                            <div id="humanActionsFields" style="margin-left: 24px; margin-top: 10px;">
                                <div class="config-field" style="margin-bottom: 6px;">
                                    <div class="config-checkbox-row" id="scrollToggle">
                                        <div class="config-checkbox checked" id="scrollCheckbox">${ICONS.check}</div>
                                        <span class="config-checkbox-label">Scroll hasta el elemento</span>
                                    </div>
                                </div>
                                <div class="config-field" style="margin-bottom: 6px;">
                                    <div class="config-checkbox-row" id="mouseToggle">
                                        <div class="config-checkbox checked" id="mouseCheckbox">${ICONS.check}</div>
                                        <span class="config-checkbox-label">Mover mouse al elemento</span>
                                    </div>
                                </div>
                                <div class="config-field">
                                    <div class="config-checkbox-row" id="clickFirstToggle">
                                        <div class="config-checkbox checked" id="clickFirstCheckbox">${ICONS.check}</div>
                                        <span class="config-checkbox-label">Click en pregunta antes de responder</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="config-divider"></div>
                        
                        <!-- ═══ SECCIÓN 3: Sobreescribir Config de Tarjetas ═══ -->
                        <div class="config-section">
                            <div class="config-section-title">🔧 Sobreescribir Config de Tarjetas</div>
                            <p style="font-size: 10px; color: #9ca3af; margin-bottom: 10px;">Estos valores sobreescriben la configuración individual de cada tarjeta del paquete.</p>
                            
                            <!-- === VALIDACIÓN === -->
                            <div class="config-subsection" style="border-left: 2px solid #a855f7; padding-left: 10px; margin-bottom: 12px;">
                                <div class="config-subsection-title">✅ Validación</div>
                                <div class="config-field" style="margin-bottom: 6px;">
                                    <div class="config-checkbox-row" id="validateFillToggle">
                                        <div class="config-checkbox checked" id="validateFillCheckbox">${ICONS.check}</div>
                                        <span class="config-checkbox-label">Validar después de FILL (texto)</span>
                                    </div>
                                </div>
                                <div class="config-field">
                                    <div class="config-checkbox-row" id="validateSelectToggle">
                                        <div class="config-checkbox checked" id="validateSelectCheckbox">${ICONS.check}</div>
                                        <span class="config-checkbox-label">Validar después de SELECT (opción)</span>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- === MÉTODOS DE LLENADO === -->
                            <div class="config-subsection" style="border-left: 2px solid #3b82f6; padding-left: 10px;">
                                <div class="config-subsection-title">⌨️ Métodos de Llenado (FILL)</div>
                                
                                <!-- Tier 1: Textos CORTOS -->
                                <div style="margin-bottom: 12px; padding: 8px; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                        <span style="font-size: 11px; font-weight: 600; color: #60a5fa;">📝 Textos Cortos</span>
                                        <span style="font-size: 9px; color: #9ca3af;">(< umbral largo)</span>
                                    </div>
                                    <select class="config-select" id="shortTextMethodSelect">
                                        <option value="keyByKey">🐢 Tecla por tecla (humano)</option>
                                        <option value="sendKeys">⚡ sendKeys (rápido)</option>
                                        <option value="ctrlV">📋 Ctrl+V (clipboard)</option>
                                        <option value="jsValue">🚀 JS injection (instantáneo)</option>
                                    </select>
                                    <!-- Opciones de keyByKey -->
                                    <div class="config-method-options" id="shortTextKeyByKeyOptions" style="margin-top: 6px;">
                                        <label class="config-label" style="font-size: 10px;">Delay entre teclas:</label>
                                        <div class="config-row" style="margin-top: 4px;">
                                            <div class="config-input-group">
                                                <label class="config-input-label">Min</label>
                                                <input type="number" class="config-input" id="typingMinInput" value="30" min="0" step="10" style="width: 55px;">
                                                <span class="config-unit">ms</span>
                                            </div>
                                            <div class="config-input-group">
                                                <label class="config-input-label">Max</label>
                                                <input type="number" class="config-input" id="typingMaxInput" value="120" min="0" step="10" style="width: 55px;">
                                                <span class="config-unit">ms</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Tier 2: Textos LARGOS -->
                                <div style="margin-bottom: 12px; padding: 8px; background: rgba(234, 179, 8, 0.1); border-radius: 6px;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                        <span style="font-size: 11px; font-weight: 600; color: #fbbf24;">📄 Textos Largos</span>
                                        <span style="font-size: 9px; color: #9ca3af;">(>= umbral largo, < umbral muy largo)</span>
                                    </div>
                                    <div class="config-inline-group" style="margin-bottom: 6px;">
                                        <label class="config-label" style="margin: 0; font-size: 10px;">Umbral:</label>
                                        <input type="number" class="config-input" id="longTextThreshold" value="30" min="10" step="5" style="width: 55px;">
                                        <span class="config-unit">chars</span>
                                    </div>
                                    <select class="config-select" id="longTextMethodSelect">
                                        <option value="sendKeys">⚡ sendKeys (rápido)</option>
                                        <option value="ctrlV">📋 Ctrl+V (clipboard)</option>
                                        <option value="jsValue">🚀 JS injection (instantáneo)</option>
                                        <option value="keyByKey">🐢 Tecla por tecla (lento)</option>
                                    </select>
                                </div>
                                
                                <!-- Tier 3: Textos MUY LARGOS -->
                                <div style="padding: 8px; background: rgba(239, 68, 68, 0.1); border-radius: 6px;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                        <span style="font-size: 11px; font-weight: 600; color: #f87171;">📚 Textos Muy Largos</span>
                                        <span style="font-size: 9px; color: #9ca3af;">(>= umbral muy largo)</span>
                                    </div>
                                    <div class="config-inline-group" style="margin-bottom: 6px;">
                                        <label class="config-label" style="margin: 0; font-size: 10px;">Umbral:</label>
                                        <input type="number" class="config-input" id="veryLongTextThreshold" value="100" min="50" step="10" style="width: 55px;">
                                        <span class="config-unit">chars</span>
                                    </div>
                                    <select class="config-select" id="veryLongTextMethodSelect">
                                        <option value="jsValue">🚀 JS injection (instantáneo)</option>
                                        <option value="ctrlV">📋 Ctrl+V (clipboard)</option>
                                        <option value="sendKeys">⚡ sendKeys (rápido)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <!-- === TIEMPOS DE PREGUNTAS === -->
                            <div class="config-subsection" style="border-left: 2px solid #10b981; padding-left: 10px; margin-top: 12px;">
                                <div class="config-subsection-title">⏱️ Tiempos entre Preguntas</div>
                                <div class="config-checkbox-row" id="overrideDelaysToggle">
                                    <div class="config-checkbox" id="overrideDelaysCheckbox">${ICONS.check}</div>
                                    <span class="config-checkbox-label">Sobreescribir delays de tarjetas</span>
                                </div>
                                <div id="overrideDelaysFields" style="margin-top: 8px; display: none;">
                                    <div class="config-row">
                                        <div class="config-input-group">
                                            <label class="config-input-label">Min</label>
                                            <input type="number" class="config-input" id="questionDelayMinInput" value="500" min="0" step="100" style="width: 65px;">
                                            <span class="config-unit">ms</span>
                                        </div>
                                        <div class="config-input-group">
                                            <label class="config-input-label">Max</label>
                                            <input type="number" class="config-input" id="questionDelayMaxInput" value="1500" min="0" step="100" style="width: 65px;">
                                            <span class="config-unit">ms</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="config-divider"></div>
                        
                        <!-- ═══ SECCIÓN 5: Visual Feedback ═══ -->
                        <div class="config-section">
                            <div class="config-section-title">✨ Visual Feedback</div>
                            <div class="config-checkbox-row" id="highlightToggle">
                                <div class="config-checkbox checked" id="highlightCheckbox">${ICONS.check}</div>
                                <span class="config-checkbox-label">Resaltar pregunta activa (glow)</span>
                            </div>
                        </div>
                        
                        <div class="config-divider"></div>
                        
                        <!-- ═══ SECCIÓN 6: Delays Especiales ═══ -->
                        <div class="config-section">
                            <div class="config-section-title">🔀 Delays Especiales</div>
                            <div class="config-row" style="gap: 20px;">
                                <div class="config-input-group">
                                    <label class="config-label" style="margin: 0; min-width: fit-content;">Branch:</label>
                                    <input type="number" class="config-input" id="branchDelayInput" value="1500" min="500" step="100" style="width: 70px;">
                                    <span class="config-unit">ms</span>
                                </div>
                                <div class="config-input-group">
                                    <label class="config-label" style="margin: 0; min-width: fit-content;">Página:</label>
                                    <input type="number" class="config-input" id="pageChangeDelayInput" value="2000" min="500" step="100" style="width: 70px;">
                                    <span class="config-unit">ms</span>
                                </div>
                            </div>
                            <p style="font-size: 9px; color: #9ca3af; margin-top: 6px;">Branch: después de click en pregunta condicional. Página: después de click en Siguiente.</p>
                        </div>
                        
                        <div class="config-divider"></div>
                        
                        <!-- ═══ SECCIÓN 7: Post Submit Actions ═══ -->
                        <div class="config-section">
                            <div class="config-section-title">📤 Post Submit Actions</div>
                            <div class="config-checkbox-row" id="postSubmitToggle">
                                <div class="config-checkbox" id="postSubmitCheckbox">${ICONS.check}</div>
                                <span class="config-checkbox-label">Guardar respuesta (capturar edit URL)</span>
                            </div>
                            <div id="postSubmitFields" style="margin-top: 8px; display: none;">
                                <div class="config-subsection" style="border-left: 2px solid #f97316;">
                                    <p style="font-size: 10px; color: #6b7280; margin-bottom: 8px;">
                                        Después de enviar el formulario, hace clic en "Guardar respuestas" y captura el link de edición.
                                    </p>
                                    <div class="config-input-group">
                                        <label class="config-label" style="margin: 0;">Timeout:</label>
                                        <input type="number" class="config-input" id="postSubmitTimeoutInput" value="60000" min="10000" step="5000" style="width: 80px;">
                                        <span class="config-unit">ms</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="config-divider"></div>
                        
                        <!-- ═══ SECCIÓN 8: Manejo de Errores ═══ -->
                        <div class="config-section">
                            <div class="config-section-title">⚠️ Manejo de Errores</div>
                            <p style="font-size: 10px; color: #6b7280; margin-bottom: 10px;">¿Qué hacer cuando ocurre un error durante la automatización?</p>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                <label class="config-checkbox-row" style="cursor: pointer;">
                                    <input type="radio" name="errorHandling" value="continue" id="errorContinue" checked style="width: 14px; height: 14px;">
                                    <span class="config-checkbox-label">Continuar con siguiente fila</span>
                                </label>
                                <label class="config-checkbox-row" style="cursor: pointer;">
                                    <input type="radio" name="errorHandling" value="pause" id="errorPause" style="width: 14px; height: 14px;">
                                    <span class="config-checkbox-label">Pausar automatización</span>
                                </label>
                                <label class="config-checkbox-row" style="cursor: pointer;">
                                    <input type="radio" name="errorHandling" value="stop" id="errorStop" style="width: 14px; height: 14px;">
                                    <span class="config-checkbox-label">Detener automatización</span>
                                </label>
                            </div>
                        </div>
                        
                    </div>
                    <div class="config-modal-footer">
                        <button class="config-btn config-btn-cancel" id="configCancel">Cancelar</button>
                        <button class="config-btn config-btn-save" id="configSave">Guardar</button>
                    </div>
                </div>
            </div>
            
            <!-- Contenedor de Tarjetas de Acción (dos slots para animación scroll) -->
            <div class="action-container" id="actionContainer">
                <!-- Tarjeta A -->
                <div class="action-wrapper" id="actionWrapperA">
                    <div class="action-card" id="actionCardA">
                        <div class="action-resize-left" data-resize="left"></div>
                        <div class="action-resize-right" data-resize="right"></div>
                        <div class="action-resize-bottom" data-resize="bottom"></div>
                        <div class="action-resize-bottom-left" data-resize="bottom-left"></div>
                        <div class="action-resize-bottom-right" data-resize="bottom-right"></div>
                        <div class="action-card-header">
                            <div class="action-card-header-content">
                                <span class="action-type-chip" id="actionTypeChipA">FILL</span>
                            </div>
                            <div class="action-indicator" id="actionIndicatorA" title="Click para colapsar, arrastrar para mover">
                                <span id="actionNumTextA">1</span>
                            </div>
                        </div>
                        <div class="action-card-body" id="actionCardBodyA"></div>
                    </div>
                </div>
                <!-- Tarjeta B -->
                <div class="action-wrapper" id="actionWrapperB">
                    <div class="action-card" id="actionCardB">
                        <div class="action-resize-left" data-resize="left"></div>
                        <div class="action-resize-right" data-resize="right"></div>
                        <div class="action-resize-bottom" data-resize="bottom"></div>
                        <div class="action-resize-bottom-left" data-resize="bottom-left"></div>
                        <div class="action-resize-bottom-right" data-resize="bottom-right"></div>
                        <div class="action-card-header">
                            <div class="action-card-header-content">
                                <span class="action-type-chip" id="actionTypeChipB">FILL</span>
                            </div>
                            <div class="action-indicator" id="actionIndicatorB" title="Click para colapsar, arrastrar para mover">
                                <span id="actionNumTextB">2</span>
                            </div>
                        </div>
                        <div class="action-card-body" id="actionCardBodyB"></div>
                    </div>
                </div>
            </div>
            
            <!-- Panel de Prueba (oculto en producción, visible solo para debug) -->
            <div class="test-panel" id="testPanel">
                <div class="test-panel-header">Preview Acciones (Fila actual)</div>
                <div class="test-panel-list" id="testPanelList">
                    <!-- Se llena con datos del paquete -->
                </div>
            </div>
        `;

        // Insert bar at top of page
        document.body.insertBefore(host, document.body.firstChild);

        // Add margin-top to body to prevent content overlap
        const originalMargin = parseInt(getComputedStyle(document.body).marginTop) || 0;
        document.body.style.marginTop = (originalMargin + BAR_HEIGHT) + 'px';

        // Get elements from shadow DOM
        const btnPlayPause = shadow.getElementById('btnPlayPause');
        const btnStop = shadow.getElementById('btnStop');
        const btnNext = shadow.getElementById('btnNext');
        const btnMode = shadow.getElementById('btnMode');
        const btnConfig = shadow.getElementById('btnConfig');
        const btnRows = shadow.getElementById('btnRows');
        const rowsDropdown = shadow.getElementById('rowsDropdown');
        const btnQuestions = shadow.getElementById('btnQuestions');
        const questionsDropdown = shadow.getElementById('questionsDropdown');
        const statusDot = shadow.getElementById('statusDot');
        const statusText = shadow.getElementById('statusText');

        // Estado de UI
        let isPlaying = false;
        let oneByOneMode = false;

        // ═══════════════════════════════════════════════════════════════════
        // DROPDOWN: SELECTOR DE COLUMNAS DE CONTROL
        // ═══════════════════════════════════════════════════════════════════

        function renderColumnSelector() {
            const questions = getAllQuestions();
            const selectedKeys = config.controlColumns.map(c => c.key);

            let itemsHtml = questions.map(q => {
                const isChecked = selectedKeys.includes(q.key);
                const isDisabled = !isChecked && selectedKeys.length >= 3;

                return `
                    <div class="checkbox-item ${isDisabled ? 'disabled' : ''}" 
                         data-key="${q.key}" 
                         data-text="${escHtml(q.text)}">
                        <div class="checkbox ${isChecked ? 'checked' : ''}">${ICONS.check}</div>
                        <span class="checkbox-label">${escHtml(q.text)}</span>
                        <span class="checkbox-key">${q.key}</span>
                    </div>
                `;
            }).join('');

            rowsDropdown.innerHTML = `
                <div class="dropdown-header">
                    <div class="dropdown-title">Selecciona columnas de control (máx 3)</div>
                    <div class="dropdown-subtitle">
                        Estas columnas se mostrarán en la barra de estado para identificar cada fila 
                        (ej: Nombre, Cédula, etc.)
                    </div>
                </div>
                <div class="dropdown-content">
                    ${itemsHtml}
                </div>
                <div class="dropdown-footer">
                    <button class="dropdown-btn dropdown-btn-secondary" id="btnCancelColumns">Cancelar</button>
                    <button class="dropdown-btn dropdown-btn-primary" id="btnSaveColumns">
                        Guardar (${selectedKeys.length}/3)
                    </button>
                </div>
            `;

            // Bind checkbox events
            rowsDropdown.querySelectorAll('.checkbox-item:not(.disabled)').forEach(item => {
                item.addEventListener('click', () => {
                    const key = item.dataset.key;
                    const text = item.dataset.text;
                    const checkbox = item.querySelector('.checkbox');
                    const isChecked = checkbox.classList.contains('checked');

                    if (isChecked) {
                        // Deselect
                        config.controlColumns = config.controlColumns.filter(c => c.key !== key);
                    } else if (config.controlColumns.length < 3) {
                        // Select
                        config.controlColumns.push({ key, text });
                    }

                    // Re-render
                    renderColumnSelector();
                });
            });

            // Cancel button
            rowsDropdown.querySelector('#btnCancelColumns').addEventListener('click', closeDropdown);

            // Save button
            rowsDropdown.querySelector('#btnSaveColumns').addEventListener('click', () => {
                if (config.controlColumns.length > 0) {
                    console.log('[AutoForms] Control columns saved:', config.controlColumns);
                    closeDropdown();
                }
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // DROPDOWN: LISTA DE FILAS
        // ═══════════════════════════════════════════════════════════════════

        function renderRowsList() {
            const rows = pkg.resolvedRows || [];
            const numCols = config.controlColumns.length;
            const results = config.rowResults || {};

            // Inicializar selectedRows si está vacío (seleccionar todas por defecto)
            if (config.selectedRows.length === 0) {
                config.selectedRows = rows.map((_, i) => i);
            }

            // Calcular estadísticas
            let completedCount = 0;
            let errorCount = 0;
            let pendingCount = 0;

            rows.forEach((_, idx) => {
                const result = results[idx];
                if (result) {
                    if (result.submitSuccess) completedCount++;
                    else if (result.error) errorCount++;
                    else pendingCount++;
                } else {
                    pendingCount++;
                }
            });

            // Función para determinar estado y color de fila
            function getRowState(idx) {
                const result = results[idx];
                if (!result) return { state: 'pending', color: '#f8fafc', border: '#e2e8f0' };
                if (result.submitSuccess && result.linkCaptured) return { state: 'success', color: '#dcfce7', border: '#22c55e' };
                if (result.submitSuccess && !result.linkCaptured) return { state: 'warning', color: '#fef3c7', border: '#f59e0b' };
                if (result.error) return { state: 'error', color: '#fee2e2', border: '#ef4444' };
                return { state: 'pending', color: '#f8fafc', border: '#e2e8f0' };
            }

            // Iconos de estado
            const STATUS_ICONS = {
                success: '<svg viewBox="0 0 20 20" fill="#22c55e" width="16" height="16"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>',
                error: '<svg viewBox="0 0 20 20" fill="#ef4444" width="16" height="16"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>',
                warning: '<svg viewBox="0 0 20 20" fill="#f59e0b" width="16" height="16"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"/></svg>',
                pending: '<svg viewBox="0 0 20 20" fill="#9ca3af" width="16" height="16"><circle cx="10" cy="10" r="6" stroke="#9ca3af" stroke-width="2" fill="none"/></svg>',
                link: '<svg viewBox="0 0 20 20" fill="#3b82f6" width="14" height="14"><path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"/></svg>'
            };

            // Generar HTML de filas
            let rowsHtml = rows.map((row, idx) => {
                const values = getRowControlValues(row);
                const isCurrent = idx === config.currentRowIndex;
                const isSelected = config.selectedRows.includes(idx);
                const { state, color, border } = getRowState(idx);
                const result = results[idx];

                let valuesHtml = values.map(v => `<td class="rm-td rm-td-value">${escHtml(v)}</td>`).join('');

                // Estado de submit
                let submitIcon = STATUS_ICONS.pending;
                if (result?.submitSuccess) submitIcon = STATUS_ICONS.success;
                else if (result?.error) submitIcon = STATUS_ICONS.error;

                // Estado de link
                let linkIcon = STATUS_ICONS.pending;
                let linkCell = '-';
                if (result?.linkCaptured && result?.url) {
                    linkIcon = STATUS_ICONS.success;
                    linkCell = `<a href="${escHtml(result.url)}" target="_blank" class="rm-link" title="${escHtml(result.url)}">${STATUS_ICONS.link}</a>`;
                } else if (result?.submitSuccess && !result?.linkCaptured) {
                    linkIcon = STATUS_ICONS.warning;
                }

                return `
                    <tr class="rm-row rm-row-${state} ${isCurrent ? 'rm-row-current' : ''}" 
                        data-index="${idx}"
                        style="background: ${color}; border-left: 3px solid ${border};">
                        <td class="rm-td rm-td-check">
                            <label class="rm-checkbox-label">
                                <input type="checkbox" class="rm-checkbox" data-row-idx="${idx}" ${isSelected ? 'checked' : ''}>
                                <span class="rm-checkbox-custom"></span>
                            </label>
                        </td>
                        <td class="rm-td rm-td-num ${isCurrent ? 'rm-current' : ''}">${idx + 1}</td>
                        ${valuesHtml}
                        <td class="rm-td rm-td-status">${submitIcon}</td>
                        <td class="rm-td rm-td-status">${linkIcon}</td>
                        <td class="rm-td rm-td-link">${linkCell}</td>
                        <td class="rm-td rm-td-action">
                            <button class="rm-view-btn" data-view-idx="${idx}" title="Ver formulario">${ICONS.eye}</button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Header de columnas
            const headerCols = config.controlColumns.map(c => {
                const shortText = c.text.length > 15 ? c.text.substring(0, 12) + '...' : c.text;
                return `<th class="rm-th">${escHtml(shortText)}</th>`;
            }).join('');

            // Calcular cuántas están seleccionadas
            const selectedCount = config.selectedRows.length;
            const allSelected = selectedCount === rows.length;

            // Construir contenido de la modal
            rowsDropdown.className = 'dropdown rows-dropdown open';
            rowsDropdown.innerHTML = `
                <div class="rm-modal-container">
                    <div class="rm-header">
                        <div class="rm-header-left">
                            <div class="rm-title">📋 Filas del Paquete (${rows.length})</div>
                            <div class="rm-subtitle">
                                <span class="rm-stat rm-stat-current">Fila actual: <strong>${config.currentRowIndex + 1}</strong></span>
                                <span class="rm-stat rm-stat-completed">✓ ${completedCount}</span>
                                <span class="rm-stat rm-stat-error">✗ ${errorCount}</span>
                                <span class="rm-stat rm-stat-pending">○ ${pendingCount}</span>
                            </div>
                        </div>
                        <button class="rm-close-btn" id="rmCloseBtn">${ICONS.close}</button>
                    </div>
                    <div class="rm-toolbar">
                        <label class="rm-select-all-label">
                            <input type="checkbox" id="rmSelectAll" ${allSelected ? 'checked' : ''}>
                            <span>Seleccionar todas (${selectedCount}/${rows.length})</span>
                        </label>
                    </div>
                    <div class="rm-table-container">
                        <table class="rm-table">
                            <thead>
                                <tr>
                                    <th class="rm-th rm-th-check"></th>
                                    <th class="rm-th rm-th-num">#</th>
                                    ${headerCols}
                                    <th class="rm-th rm-th-status" title="Estado de envío">📤</th>
                                    <th class="rm-th rm-th-status" title="Link capturado">🔗</th>
                                    <th class="rm-th rm-th-link">URL</th>
                                    <th class="rm-th rm-th-action"></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                    <div class="rm-footer">
                        <button class="rm-btn rm-btn-export" id="rmExportExcel">📊 Exportar Excel</button>
                        <button class="rm-btn rm-btn-secondary" id="rmReconfigure">⚙️ Cambiar columnas</button>
                        <button class="rm-btn rm-btn-primary" id="rmCloseFooter">Cerrar</button>
                    </div>
                </div>
            `;

            // ═══════════════════════════════════════════════════════════════
            // EVENT HANDLERS
            // ═══════════════════════════════════════════════════════════════

            // Close buttons
            rowsDropdown.querySelector('#rmCloseBtn').addEventListener('click', closeDropdown);
            rowsDropdown.querySelector('#rmCloseFooter').addEventListener('click', closeDropdown);

            // Select all checkbox
            rowsDropdown.querySelector('#rmSelectAll').addEventListener('change', (e) => {
                if (e.target.checked) {
                    config.selectedRows = rows.map((_, i) => i);
                } else {
                    config.selectedRows = [];
                }
                renderRowsList();
            });

            // Individual checkboxes
            rowsDropdown.querySelectorAll('.rm-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.rowIdx);
                    if (e.target.checked) {
                        if (!config.selectedRows.includes(idx)) {
                            config.selectedRows.push(idx);
                        }
                    } else {
                        config.selectedRows = config.selectedRows.filter(i => i !== idx);
                    }
                    renderRowsList();
                });
            });

            // Row click (jump to row) - only on the row number cell
            rowsDropdown.querySelectorAll('.rm-td-num').forEach(cell => {
                cell.addEventListener('click', () => {
                    const row = cell.closest('.rm-row');
                    const idx = parseInt(row.dataset.index);
                    config.currentRowIndex = idx;
                    window.__autoforms_commands.push({
                        type: 'jump_to_row',
                        rowIndex: idx,
                        time: Date.now()
                    });
                    console.log('[AutoForms] Jump to row:', idx + 1);
                    renderRowsList();
                });
            });

            // View buttons
            rowsDropdown.querySelectorAll('.rm-view-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.viewIdx);
                    showFormModal(idx);
                });
            });

            // Export Excel
            rowsDropdown.querySelector('#rmExportExcel').addEventListener('click', () => {
                window.__autoforms_commands.push({
                    type: 'excel_export_request',
                    controlColumns: config.controlColumns,
                    selectedRows: config.selectedRows,
                    time: Date.now()
                });
                console.log('[AutoForms] Excel export requested');

                const btn = rowsDropdown.querySelector('#rmExportExcel');
                const originalText = btn.innerHTML;
                btn.innerHTML = '⏳ Exportando...';
                btn.disabled = true;

                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }, 3000);
            });

            // Reconfigure columns
            rowsDropdown.querySelector('#rmReconfigure').addEventListener('click', () => {
                config.controlColumns = [];
                renderColumnSelector();
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // MODAL: VISTA DE FORMULARIO COMPLETO
        // ═══════════════════════════════════════════════════════════════════

        function showFormModal(rowIndex) {
            const rows = pkg.resolvedRows || [];
            const row = rows[rowIndex];
            if (!row) return;

            const questions = getAllQuestions();
            const answers = row.answers || {};

            // Update modal header
            modalTitle.textContent = `Formulario Fila #${rowIndex + 1} `;
            modalSubtitle.textContent = `${questions.length} preguntas`;

            // Group questions by page
            const questionsByPage = {};
            if (pkg.instructions && pkg.instructions.pages) {
                pkg.instructions.pages.forEach(page => {
                    const pageKey = page.pageKey || `page_${page.pageNumber} `;
                    questionsByPage[pageKey] = {
                        pageNumber: page.pageNumber,
                        questions: page.questions || []
                    };
                });
            }

            let html = '';

            // Render each page
            Object.keys(questionsByPage).sort((a, b) => {
                return questionsByPage[a].pageNumber - questionsByPage[b].pageNumber;
            }).forEach(pageKey => {
                const pageData = questionsByPage[pageKey];

                html += `<div class="page-section">`;
                html += `<div class="page-header">Página ${pageData.pageNumber}</div>`;

                pageData.questions.forEach(q => {
                    const answer = answers[q.key] || '';
                    const hasOptions = q.options && q.options.length > 0;

                    html += `<div class="page-question">`;
                    html += `<span class="page-question-num">${q.key.replace('q', '')}</span>`;
                    html += `<div class="page-question-content">`;
                    html += `<div class="page-question-text">${escHtml(q.text || q.key)}</div>`;

                    // Para preguntas de selección: mostrar opciones en columna, respuesta resaltada
                    if (hasOptions) {
                        html += `<div class="page-options">`;
                        q.options.forEach(opt => {
                            const optValue = opt.value || opt.text || opt;
                            const isSelected = answer === optValue;
                            html += `<span class="page-option ${isSelected ? 'selected' : ''}">${escHtml(optValue)}</span>`;
                        });
                        html += `</div>`;
                    } else if (answer) {
                        // Para preguntas de texto: mostrar respuesta con expand/collapse si es larga
                        const isLong = answer.length > 100;
                        const answerId = `ans_${rowIndex}_${q.key}`;

                        if (isLong) {
                            html += `<div class="page-answer collapsed" id="${answerId}">${escHtml(answer)}</div>`;
                            html += `<button class="expand-btn" data-target="${answerId}">${ICONS.expand} Ver más</button>`;
                        } else {
                            html += `<div class="page-answer">${escHtml(answer)}</div>`;
                        }
                    }

                    html += `</div></div>`;
                });

                html += `</div>`;
            });

            modalContent.innerHTML = html;

            // Bind expand/collapse buttons
            modalContent.querySelectorAll('.expand-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.dataset.target;
                    const target = modalContent.querySelector(`#${targetId} `);
                    if (target) {
                        const isCollapsed = target.classList.contains('collapsed');
                        target.classList.toggle('collapsed');
                        btn.innerHTML = isCollapsed ? `${ICONS.collapse} Ver menos` : `${ICONS.expand} Ver más`;
                    }
                });
            });

            formModalOverlay.classList.add('visible');
            closeDropdown();
        }

        function closeFormModal() {
            formModalOverlay.classList.remove('visible');
        }

        // ═══════════════════════════════════════════════════════════════════
        // DROPDOWN TOGGLE
        // ═══════════════════════════════════════════════════════════════════

        function toggleRowsDropdown() {
            // Bloquear apertura durante automatización en curso
            if (config.isRunning && !config.isPaused) {
                console.log('[AutoForms] Modal de filas bloqueada - automatización en curso');
                return;
            }

            const isOpen = rowsDropdown.classList.contains('open');

            if (isOpen) {
                closeDropdown();
            } else {
                // Check if control columns are configured
                if (config.controlColumns.length === 0) {
                    renderColumnSelector();
                } else {
                    renderRowsList();
                }
                rowsDropdown.classList.add('open');
                btnRows.classList.add('active');
                config.dropdownOpen = 'rows';
            }
        }

        function closeDropdown() {
            rowsDropdown.classList.remove('open');
            btnRows.classList.remove('active');
            questionsDropdown.classList.remove('open');
            btnQuestions.classList.remove('active');
            config.dropdownOpen = null;
        }

        // ═══════════════════════════════════════════════════════════════════
        // DROPDOWN: LISTA DE PREGUNTAS
        // ═══════════════════════════════════════════════════════════════════

        function renderQuestionsList() {
            const questions = getAllQuestions();

            // Agrupar por página
            const questionsByPage = {};
            if (pkg.instructions && pkg.instructions.pages) {
                pkg.instructions.pages.forEach(page => {
                    const pageKey = page.pageKey || `page_${page.pageNumber} `;
                    questionsByPage[pageKey] = {
                        pageNumber: page.pageNumber,
                        questions: page.questions || []
                    };
                });
            }

            let html = `
                <div class="dropdown-header">
                    <div class="dropdown-title">Todas las preguntas (${questions.length})</div>
                    <div class="dropdown-subtitle">Haz clic en una pregunta para resaltarla en el formulario</div>
                </div>
                <div class="dropdown-content" style="max-height: 400px;">
            `;

            // Renderizar por página
            Object.keys(questionsByPage).sort((a, b) => {
                return questionsByPage[a].pageNumber - questionsByPage[b].pageNumber;
            }).forEach(pageKey => {
                const pageData = questionsByPage[pageKey];

                html += `<div class="page-section" style="margin-bottom: 12px;">`;
                html += `<div class="page-header" style="font-size: 11px; color: #667eea; font-weight: 600; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb;">Página ${pageData.pageNumber}</div>`;

                pageData.questions.forEach(q => {
                    const hasOptions = q.options && q.options.length > 0;
                    const isBranch = q.isBranch || false;
                    const branchBadge = isBranch ? '<span style="background:#f59e0b; color:white; padding:1px 4px; border-radius:3px; font-size:9px; margin-left:4px;">BRANCH</span>' : '';

                    let optionsHtml = '';
                    if (hasOptions) {
                        optionsHtml = '<div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; padding-left:28px;">' +
                            q.options.slice(0, 5).map(o => `<span style="background:#e5e7eb; padding:1px 5px; border-radius:3px; font-size:9px; color:#475569;">${escHtml(o.value || o.text || o)}</span>`).join('') +
                            (q.options.length > 5 ? `<span style="font-size:9px; color:#9ca3af;">+${q.options.length - 5} más</span>` : '') +
                            '</div>';
                    }

                    html += `<div class="question-item-small" data-question-key="${q.key}" style="padding:6px 8px; margin-bottom:4px; background:#f9fafb; border-radius:4px; cursor:pointer; transition:background 0.1s;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="width:20px; height:20px; background:#667eea; color:white; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; flex-shrink:0;">${q.key.replace('q', '')}</span>
                            <span style="font-size:11px; color:#374151; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(q.text || q.key)}</span>
                            <span style="font-size:9px; color:#9ca3af; text-transform:uppercase;">${q.type || 'text'}</span>
                            ${branchBadge}
                        </div>
                        ${optionsHtml}
                    </div>`;
                });

                html += '</div>';
            });

            html += `</div>
                <div class="dropdown-footer">
                    <button class="dropdown-btn dropdown-btn-primary" id="btnCloseQuestions">Cerrar</button>
                </div>
            `;

            questionsDropdown.className = 'dropdown rows-dropdown open';
            questionsDropdown.innerHTML = html;

            // Bind question click events
            questionsDropdown.querySelectorAll('.question-item-small[data-question-key]').forEach(item => {
                item.addEventListener('mouseover', () => {
                    item.style.background = '#e0e7ff';
                });
                item.addEventListener('mouseout', () => {
                    item.style.background = '#f9fafb';
                });
                item.addEventListener('click', () => {
                    const key = item.dataset.questionKey;
                    // Enviar comando para resaltar la pregunta en el formulario
                    window.__autoforms_commands.push({
                        type: 'highlight_question',
                        questionKey: key,
                        time: Date.now()
                    });
                    console.log('[AutoForms] Highlight question:', key);
                    closeDropdown();
                });
            });

            // Close button
            questionsDropdown.querySelector('#btnCloseQuestions').addEventListener('click', closeDropdown);
        }

        function toggleQuestionsDropdown() {
            const isOpen = questionsDropdown.classList.contains('open');

            if (isOpen) {
                closeDropdown();
            } else {
                // Cerrar otros dropdowns primero
                rowsDropdown.classList.remove('open');
                btnRows.classList.remove('active');

                renderQuestionsList();
                questionsDropdown.classList.add('open');
                btnQuestions.classList.add('active');
                config.dropdownOpen = 'questions';
            }
        }

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (config.dropdownOpen && !host.contains(e.target)) {
                closeDropdown();
            }
        });

        // Modal elements
        const formModalOverlay = shadow.getElementById('formModalOverlay');
        const modalTitle = shadow.getElementById('modalTitle');
        const modalSubtitle = shadow.getElementById('modalSubtitle');
        const modalContent = shadow.getElementById('modalContent');
        const modalCloseBtn = shadow.getElementById('modalClose');

        // Close modal events
        modalCloseBtn.onclick = closeFormModal;
        formModalOverlay.onclick = (e) => {
            if (e.target === formModalOverlay) closeFormModal();
        };

        // ═══════════════════════════════════════════════════════════════════
        // BUTTON HANDLERS
        // ═══════════════════════════════════════════════════════════════════

        btnRows.onclick = (e) => {
            e.stopPropagation();
            toggleRowsDropdown();
        };

        btnQuestions.onclick = (e) => {
            e.stopPropagation();
            toggleQuestionsDropdown();
        };

        // ════════════════════════════════════════════════════════════════
        // VALIDACIÓN: Columnas de control requeridas antes de iniciar
        // ════════════════════════════════════════════════════════════════
        function validateControlColumns() {
            if (config.controlColumns.length === 0) {
                showErrorModal(
                    '⚠️ Columnas de Control Requeridas',
                    'Debe seleccionar al menos una columna de control antes de iniciar la automatización.',
                    'Haz clic en el botón "Filas" para configurar las columnas de control.'
                );
                return false;
            }
            return true;
        }

        function showErrorModal(title, message, hint) {
            // Crear modal de error si no existe
            let errorModal = shadow.getElementById('errorModalOverlay');
            if (!errorModal) {
                errorModal = document.createElement('div');
                errorModal.id = 'errorModalOverlay';
                errorModal.className = 'modal-overlay visible';
                errorModal.innerHTML = `
                <div class="modal" style="width: 380px;">
                        <div class="modal-header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                            <div>
                                <div class="modal-title" id="errorModalTitle">Error</div>
                            </div>
                            <button class="modal-close" id="errorModalClose">${ICONS.close}</button>
                        </div>
                        <div class="modal-content" style="padding: 20px;">
                            <p id="errorModalMessage" style="font-size: 13px; color: #1f2937; margin-bottom: 12px;"></p>
                            <p id="errorModalHint" style="font-size: 11px; color: #6b7280; background: #f3f4f6; padding: 10px; border-radius: 6px;"></p>
                        </div>
                        <div style="padding: 12px 20px; border-top: 1px solid #e5e7eb; text-align: right;">
                            <button class="dropdown-btn dropdown-btn-primary" id="errorModalOk">Entendido</button>
                        </div>
                    </div>
                `;
                shadow.appendChild(errorModal);

                const closeError = () => errorModal.classList.remove('visible');
                errorModal.querySelector('#errorModalClose').onclick = closeError;
                errorModal.querySelector('#errorModalOk').onclick = closeError;
                errorModal.onclick = (e) => { if (e.target === errorModal) closeError(); };
            }

            shadow.getElementById('errorModalTitle').textContent = title;
            shadow.getElementById('errorModalMessage').textContent = message;
            shadow.getElementById('errorModalHint').textContent = hint;
            errorModal.classList.add('visible');
        }

        // Play/Pause toggle button
        // IMPORTANTE: NO cambiamos estado localmente, esperamos confirmación de Python via syncState
        btnPlayPause.onclick = () => {
            if (isPlaying) {
                // Está en play → pausar (enviar comando, Python confirmará)
                window.__autoforms_commands.push({ type: 'pause', time: Date.now() });
                console.log('[AutoForms] Pause command sent to Python (waiting for sync)');
                // NO cambiar isPlaying aquí - Python confirmará via __autoforms_syncState
            } else {
                // ═══ Validar columnas de control antes de iniciar ═══
                if (!validateControlColumns()) {
                    return; // No iniciar si no hay columnas configuradas
                }

                // Está pausado → play (enviar comando, Python confirmará)
                window.__autoforms_commands.push({ type: 'start', time: Date.now() });
                console.log('[AutoForms] Start command sent to Python (waiting for sync)');
                // NO cambiar isPlaying aquí - Python confirmará via __autoforms_syncState
            }
        };

        btnStop.onclick = () => {
            window.__autoforms_commands.push({ type: 'stop', time: Date.now() });
            isPlaying = false;
            btnPlayPause.innerHTML = ICONS.play;
            btnPlayPause.classList.remove('paused');
            btnPlayPause.title = 'Iniciar';
        };

        btnNext.onclick = () => {
            window.__autoforms_commands.push({ type: 'next', time: Date.now() });
        };

        // Toggle mode: uno a uno vs todas las filas
        btnMode.onclick = () => {
            oneByOneMode = !oneByOneMode;

            if (oneByOneMode) {
                btnMode.innerHTML = ICONS.one;
                btnMode.classList.add('active');
                btnMode.title = 'Modo: Una fila';
                btnNext.classList.remove('hidden');
            } else {
                btnMode.innerHTML = ICONS.loop;
                btnMode.classList.remove('active');
                btnMode.title = 'Modo: Todas las filas';
                btnNext.classList.add('hidden');
            }

            window.__autoforms_commands.push({ type: 'mode', oneByOne: oneByOneMode, time: Date.now() });
        };

        // ═══════════════════════════════════════════════════════════════════
        // MODAL DE CONFIGURACIÓN
        // ═══════════════════════════════════════════════════════════════════

        const configModalOverlay = shadow.getElementById('configModalOverlay');
        const configModalClose = shadow.getElementById('configModalClose');
        const configCancel = shadow.getElementById('configCancel');
        const configSave = shadow.getElementById('configSave');
        const randomDelayToggle = shadow.getElementById('randomDelayToggle');
        const randomDelayCheckbox = shadow.getElementById('randomDelayCheckbox');
        const fixedDelayField = shadow.getElementById('fixedDelayField');
        const randomDelayField = shadow.getElementById('randomDelayField');
        const delayInput = shadow.getElementById('delayInput');
        const delayMinInput = shadow.getElementById('delayMinInput');
        const delayMaxInput = shadow.getElementById('delayMaxInput');

        // Override delays
        const overrideDelaysToggle = shadow.getElementById('overrideDelaysToggle');
        const overrideDelaysCheckbox = shadow.getElementById('overrideDelaysCheckbox');
        const overrideDelaysFields = shadow.getElementById('overrideDelaysFields');
        const questionDelayMinInput = shadow.getElementById('questionDelayMinInput');
        const questionDelayMaxInput = shadow.getElementById('questionDelayMaxInput');

        // Human actions
        const humanActionsToggle = shadow.getElementById('humanActionsToggle');
        const humanActionsCheckbox = shadow.getElementById('humanActionsCheckbox');
        const humanActionsFields = shadow.getElementById('humanActionsFields');
        const scrollToggle = shadow.getElementById('scrollToggle');
        const scrollCheckbox = shadow.getElementById('scrollCheckbox');
        const mouseToggle = shadow.getElementById('mouseToggle');
        const mouseCheckbox = shadow.getElementById('mouseCheckbox');
        const clickFirstToggle = shadow.getElementById('clickFirstToggle');
        const clickFirstCheckbox = shadow.getElementById('clickFirstCheckbox');

        // Validation (separado)
        const validateFillToggle = shadow.getElementById('validateFillToggle');
        const validateFillCheckbox = shadow.getElementById('validateFillCheckbox');
        const validateSelectToggle = shadow.getElementById('validateSelectToggle');
        const validateSelectCheckbox = shadow.getElementById('validateSelectCheckbox');

        // Fill config (3-tier)
        const shortTextMethodSelect = shadow.getElementById('shortTextMethodSelect');
        const shortTextKeyByKeyOptions = shadow.getElementById('shortTextKeyByKeyOptions');
        const typingMinInput = shadow.getElementById('typingMinInput');
        const typingMaxInput = shadow.getElementById('typingMaxInput');
        const longTextThresholdInput = shadow.getElementById('longTextThreshold');
        const longTextMethodSelect = shadow.getElementById('longTextMethodSelect');
        const veryLongTextThresholdInput = shadow.getElementById('veryLongTextThreshold');
        const veryLongTextMethodSelect = shadow.getElementById('veryLongTextMethodSelect');

        // Visual feedback
        const highlightToggle = shadow.getElementById('highlightToggle');
        const highlightCheckbox = shadow.getElementById('highlightCheckbox');

        // Delays especiales
        const branchDelayInput = shadow.getElementById('branchDelayInput');
        const pageChangeDelayInput = shadow.getElementById('pageChangeDelayInput');

        // Post Submit Actions
        const postSubmitToggle = shadow.getElementById('postSubmitToggle');
        const postSubmitCheckbox = shadow.getElementById('postSubmitCheckbox');
        const postSubmitFields = shadow.getElementById('postSubmitFields');
        const postSubmitTimeoutInput = shadow.getElementById('postSubmitTimeoutInput');

        // Estado de configuración completo
        let configState = {
            // ═══ Sección 1: Tiempos Globales ═══
            randomDelay: false,
            fixedDelay: 2000,
            minDelay: 1000,
            maxDelay: 3000,

            // ═══ Sección 2: Human Actions ═══
            humanActionsEnabled: true,
            scrollToElement: true,
            moveMouseToElement: true,
            clickQuestionFirst: true,

            // ═══ Sección 3: Validación ═══
            validateAfterFill: true,
            validateAfterSelect: true,

            // ═══ Sección 4: Override Config (Llenado + Tiempos) ═══
            // Métodos de llenado
            shortTextMethod: 'sendKeys',  // Changed from 'keyByKey'
            typingDelayMinMs: 30,
            typingDelayMaxMs: 120,
            longTextThreshold: 30,
            longTextMethod: 'sendKeys',
            veryLongTextThreshold: 100,
            veryLongTextMethod: 'jsValue',
            // Override tiempos
            overrideDelays: true,  // Changed from false
            delayMinMs: 100,  // Changed from 500
            delayMaxMs: 400,  // Changed from 1500

            // ═══ Sección 5: Visual Feedback ═══
            highlightElements: true,

            // ═══ Sección 6: Delays Especiales ═══
            branchDelayMs: 990,  // Changed from 1500
            pageChangeDelayMs: 400,  // Changed from 2000

            // ═══ Sección 7: Post Submit Actions ═══
            postSubmitEnabled: true,  // Changed from false
            postSubmitTimeoutMs: 60000,

            // ═══ Sección 8: Manejo de Errores ═══
            errorHandling: 'continue'  // 'continue' | 'pause' | 'stop'
        };

        function updateShortTextMethodUI() {
            const method = shortTextMethodSelect.value;
            shortTextKeyByKeyOptions.style.display = method === 'keyByKey' ? 'block' : 'none';
        }

        function openConfigModal() {
            // ═══ Sección 1: Tiempos Globales ═══
            delayInput.value = configState.fixedDelay;
            delayMinInput.value = configState.minDelay;
            delayMaxInput.value = configState.maxDelay;

            // Random delay
            randomDelayCheckbox.classList.toggle('checked', configState.randomDelay);
            fixedDelayField.style.display = configState.randomDelay ? 'none' : 'block';
            randomDelayField.style.display = configState.randomDelay ? 'block' : 'none';

            // ═══ Sección 2: Human Actions ═══
            humanActionsCheckbox.classList.toggle('checked', configState.humanActionsEnabled);
            humanActionsFields.style.display = configState.humanActionsEnabled ? 'block' : 'none';
            scrollCheckbox.classList.toggle('checked', configState.scrollToElement);
            mouseCheckbox.classList.toggle('checked', configState.moveMouseToElement);
            clickFirstCheckbox.classList.toggle('checked', configState.clickQuestionFirst);

            // ═══ Sección 3: Validación ═══
            validateFillCheckbox.classList.toggle('checked', configState.validateAfterFill);
            validateSelectCheckbox.classList.toggle('checked', configState.validateAfterSelect);

            // ═══ Sección 4: Override Config ═══
            shortTextMethodSelect.value = configState.shortTextMethod;
            typingMinInput.value = configState.typingDelayMinMs;
            typingMaxInput.value = configState.typingDelayMaxMs;
            updateShortTextMethodUI();

            longTextThresholdInput.value = configState.longTextThreshold;
            longTextMethodSelect.value = configState.longTextMethod;
            veryLongTextThresholdInput.value = configState.veryLongTextThreshold;
            veryLongTextMethodSelect.value = configState.veryLongTextMethod;

            overrideDelaysCheckbox.classList.toggle('checked', configState.overrideDelays);
            questionDelayMinInput.value = configState.delayMinMs;
            questionDelayMaxInput.value = configState.delayMaxMs;
            overrideDelaysFields.style.display = configState.overrideDelays ? 'block' : 'none';

            // ═══ Sección 5: Visual Feedback ═══
            highlightCheckbox.classList.toggle('checked', configState.highlightElements);

            // ═══ Sección 6: Delays Especiales ═══
            branchDelayInput.value = configState.branchDelayMs;
            pageChangeDelayInput.value = configState.pageChangeDelayMs;

            // ═══ Sección 7: Post Submit Actions ═══
            postSubmitCheckbox.classList.toggle('checked', configState.postSubmitEnabled);
            postSubmitTimeoutInput.value = configState.postSubmitTimeoutMs;
            postSubmitFields.style.display = configState.postSubmitEnabled ? 'block' : 'none';

            // ═══ Sección 8: Manejo de Errores ═══
            const errorRadios = shadow.querySelectorAll('input[name="errorHandling"]');
            errorRadios.forEach(radio => {
                radio.checked = radio.value === configState.errorHandling;
            });

            configModalOverlay.classList.add('open');
        }

        function closeConfigModal() {
            configModalOverlay.classList.remove('open');
        }

        function toggleRandomDelay() {
            const isChecked = randomDelayCheckbox.classList.toggle('checked');
            fixedDelayField.style.display = isChecked ? 'none' : 'block';
            randomDelayField.style.display = isChecked ? 'block' : 'none';
        }

        function toggleOverrideDelays() {
            const isChecked = overrideDelaysCheckbox.classList.toggle('checked');
            overrideDelaysFields.style.display = isChecked ? 'block' : 'none';
        }

        function toggleHumanActions() {
            const isChecked = humanActionsCheckbox.classList.toggle('checked');
            humanActionsFields.style.display = isChecked ? 'block' : 'none';
        }

        function toggleCheckbox(checkbox) {
            checkbox.classList.toggle('checked');
        }

        function saveConfig() {
            configState = {
                // ═══ Sección 1: Tiempos Globales ═══
                randomDelay: randomDelayCheckbox.classList.contains('checked'),
                fixedDelay: parseInt(delayInput.value) || 2000,
                minDelay: parseInt(delayMinInput.value) || 1000,
                maxDelay: parseInt(delayMaxInput.value) || 3000,

                // ═══ Sección 2: Human Actions ═══
                humanActionsEnabled: humanActionsCheckbox.classList.contains('checked'),
                scrollToElement: scrollCheckbox.classList.contains('checked'),
                moveMouseToElement: mouseCheckbox.classList.contains('checked'),
                clickQuestionFirst: clickFirstCheckbox.classList.contains('checked'),

                // ═══ Sección 3: Validación ═══
                validateAfterFill: validateFillCheckbox.classList.contains('checked'),
                validateAfterSelect: validateSelectCheckbox.classList.contains('checked'),

                // ═══ Sección 4: Override Config ═══
                // Métodos de llenado (3 tiers)
                shortTextMethod: shortTextMethodSelect.value,
                typingDelayMinMs: parseInt(typingMinInput.value) || 30,
                typingDelayMaxMs: parseInt(typingMaxInput.value) || 120,
                longTextThreshold: parseInt(longTextThresholdInput.value) || 30,
                longTextMethod: longTextMethodSelect.value,
                veryLongTextThreshold: parseInt(veryLongTextThresholdInput.value) || 100,
                veryLongTextMethod: veryLongTextMethodSelect.value,
                // Override tiempos
                overrideDelays: overrideDelaysCheckbox.classList.contains('checked'),
                delayMinMs: parseInt(questionDelayMinInput.value) || 500,
                delayMaxMs: parseInt(questionDelayMaxInput.value) || 1500,

                // ═══ Sección 5: Visual Feedback ═══
                highlightElements: highlightCheckbox.classList.contains('checked'),

                // ═══ Sección 6: Delays Especiales ═══
                branchDelayMs: parseInt(branchDelayInput.value) || 1500,
                pageChangeDelayMs: parseInt(pageChangeDelayInput.value) || 2000,

                // ═══ Sección 7: Post Submit Actions ═══
                postSubmitEnabled: postSubmitCheckbox.classList.contains('checked'),
                postSubmitTimeoutMs: parseInt(postSubmitTimeoutInput.value) || 60000,

                // ═══ Sección 8: Manejo de Errores ═══
                errorHandling: shadow.querySelector('input[name="errorHandling"]:checked')?.value || 'continue'
            };

            // Enviar configuración al backend
            window.__autoforms_commands.push({
                type: 'config_update',
                config: configState,
                time: Date.now()
            });

            closeConfigModal();
        }

        // Event listeners del modal de configuración
        btnConfig.onclick = openConfigModal;
        configModalClose.onclick = closeConfigModal;
        configCancel.onclick = closeConfigModal;
        configSave.onclick = saveConfig;
        randomDelayToggle.onclick = toggleRandomDelay;
        overrideDelaysToggle.onclick = toggleOverrideDelays;
        humanActionsToggle.onclick = toggleHumanActions;
        scrollToggle.onclick = () => toggleCheckbox(scrollCheckbox);
        mouseToggle.onclick = () => toggleCheckbox(mouseCheckbox);
        clickFirstToggle.onclick = () => toggleCheckbox(clickFirstCheckbox);
        validateFillToggle.onclick = () => toggleCheckbox(validateFillCheckbox);
        validateSelectToggle.onclick = () => toggleCheckbox(validateSelectCheckbox);
        highlightToggle.onclick = () => toggleCheckbox(highlightCheckbox);
        shortTextMethodSelect.onchange = updateShortTextMethodUI;

        // Post Submit toggle
        postSubmitToggle.onclick = () => {
            const isChecked = postSubmitCheckbox.classList.toggle('checked');
            postSubmitFields.style.display = isChecked ? 'block' : 'none';
        };

        configModalOverlay.onclick = (e) => {
            if (e.target === configModalOverlay) closeConfigModal();
        };

        // ═══════════════════════════════════════════════════════════════════
        // SISTEMA DE TARJETAS DE ACCIÓN (scroll simultáneo A/B)
        // ═══════════════════════════════════════════════════════════════════

        // Elementos de tarjeta A
        const wrapperA = shadow.getElementById('actionWrapperA');
        const indicatorA = shadow.getElementById('actionIndicatorA');
        const numTextA = shadow.getElementById('actionNumTextA');
        const cardA = shadow.getElementById('actionCardA');
        const chipA = shadow.getElementById('actionTypeChipA');
        const bodyA = shadow.getElementById('actionCardBodyA');

        // Elementos de tarjeta B
        const wrapperB = shadow.getElementById('actionWrapperB');
        const indicatorB = shadow.getElementById('actionIndicatorB');
        const numTextB = shadow.getElementById('actionNumTextB');
        const cardB = shadow.getElementById('actionCardB');
        const chipB = shadow.getElementById('actionTypeChipB');
        const bodyB = shadow.getElementById('actionCardBodyB');

        const testPanel = shadow.getElementById('testPanel');
        const testPanelList = shadow.getElementById('testPanelList');
        const actionContainer = shadow.getElementById('actionContainer');

        // Iconos para estados
        const STATE_ICONS = {
            check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`,
            alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
            robot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/></svg>`,
            click: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>`
        };

        // Estado de automatización (para bloquear drag/resize durante play)
        let isAutomationRunning = false;

        // ═══════════════════════════════════════════════════════════════════
        // SISTEMA DE DRAG, COLAPSO Y RESIZE
        // ═══════════════════════════════════════════════════════════════════

        let isDragging = false;
        let isResizing = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let containerStartX = 0;
        let containerStartY = 0;
        let resizeSide = null;
        let resizeStartWidth = 0;
        let resizeStartHeight = 0;
        let resizeStartX = 0;
        let resizeStartY = 0;
        let containerInitialLeft = 0;
        let containerInitialTop = 0;
        let activeResizeCard = null;
        let isCollapsed = false;
        let dragThreshold = 5;
        let hasDragged = false;

        // Obtener posición actual del contenedor
        function getContainerPosition() {
            const rect = actionContainer.getBoundingClientRect();
            return { x: rect.left, y: rect.top };
        }

        // Aplicar posición al contenedor (con límites de pantalla)
        function setContainerPosition(x, y) {
            const containerRect = actionContainer.getBoundingClientRect();
            const padding = 10;

            // Limitar a los bordes de la pantalla
            const maxX = window.innerWidth - containerRect.width - padding;
            const maxY = window.innerHeight - containerRect.height - padding;

            x = Math.max(padding, Math.min(x, maxX));
            y = Math.max(BAR_HEIGHT + padding, Math.min(y, maxY));

            // Cambiar de right a left positioning para drag
            actionContainer.style.right = 'auto';
            actionContainer.style.left = x + 'px';
            actionContainer.style.top = y + 'px';
        }

        // Handler de inicio de drag (mousedown en el indicador)
        function handleDragStart(e, wrapper) {
            // Si la automatización está corriendo, no permitir drag/colapso
            if (isAutomationRunning) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // Prevenir default y propagación
            e.preventDefault();
            e.stopPropagation();

            isDragging = true;
            hasDragged = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = actionContainer.getBoundingClientRect();
            containerStartX = rect.left;
            containerStartY = rect.top;

            wrapper.classList.add('dragging');
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        }

        // Handler de drag (mousemove)
        function handleDragMove(e) {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            // Solo marcar como "dragged" si movió más que el threshold
            if (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold) {
                hasDragged = true;
            }

            if (hasDragged) {
                setContainerPosition(containerStartX + deltaX, containerStartY + deltaY);
            }
        }

        // Handler de fin de drag (mouseup)
        function handleDragEnd(e) {
            if (!isDragging) return;

            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            wrapperA.classList.remove('dragging');
            wrapperB.classList.remove('dragging');

            // Si no se movió (click simple), toggle colapso
            if (!hasDragged) {
                toggleCollapse();
            }
        }

        // Toggle colapso de la tarjeta
        function toggleCollapse() {
            isCollapsed = !isCollapsed;
            wrapperA.classList.toggle('collapsed', isCollapsed);
            wrapperB.classList.toggle('collapsed', isCollapsed);
        }

        // ═══════════════════════════════════════════════════════════════════
        // RESIZE HANDLERS
        // ═══════════════════════════════════════════════════════════════════

        function handleResizeStart(e, card, side) {
            // Si la automatización está corriendo, no permitir resize
            if (isAutomationRunning) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            isResizing = true;
            resizeSide = side;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;

            resizeStartWidth = card.offsetWidth;
            resizeStartHeight = card.offsetHeight;

            // CRÍTICO: Convertir de right a left positioning ANTES de resize
            // Esto evita que el navegador mueva el borde izquierdo automáticamente
            const rect = actionContainer.getBoundingClientRect();
            actionContainer.style.right = 'auto';
            actionContainer.style.left = rect.left + 'px';
            actionContainer.style.top = rect.top + 'px';

            // Guardar posición inicial del contenedor para correcciones de lado izquierdo
            containerInitialLeft = rect.left;
            containerInitialTop = rect.top;

            activeResizeCard = card;

            // Cursor apropiado
            let cursor = 'ew-resize';
            if (side === 'bottom') cursor = 'ns-resize';
            else if (side === 'bottom-left') cursor = 'nesw-resize';
            else if (side === 'bottom-right') cursor = 'nwse-resize';

            document.body.style.cursor = cursor;
            document.body.style.userSelect = 'none';
        }

        function handleResizeMove(e) {
            if (!isResizing || !activeResizeCard) return;

            const deltaX = e.clientX - resizeStartX;
            const deltaY = e.clientY - resizeStartY;
            let newWidth = resizeStartWidth;

            // === HORIZONTAL ===
            if (resizeSide.includes('right')) {
                newWidth = resizeStartWidth + deltaX;
            } else if (resizeSide.includes('left')) {
                newWidth = resizeStartWidth - deltaX;
            }

            // Aplicar límites HORIZONTALES (aumentado max a 600)
            newWidth = Math.max(180, Math.min(600, newWidth));

            // Aplicar width solo si es side horizontal o esquina
            if (resizeSide.includes('left') || resizeSide.includes('right')) {
                activeResizeCard.style.width = newWidth + 'px';
            }

            // Corrección de posición IZQUIERDA
            if (resizeSide.includes('left')) {
                // Cuánto creció realmente hacia la izquierda (positivo = creció)
                const expandedBy = newWidth - resizeStartWidth;

                // Mover contenedor a la izquierda esa cantidad
                const newLeft = containerInitialLeft - expandedBy;

                // Aplicar posición (setContainerPosition manejará límites de pantalla)
                setContainerPosition(newLeft, containerInitialTop);
            }

            // === VERTICAL ===
            if (resizeSide.includes('bottom')) {
                let newHeight = resizeStartHeight + deltaY;
                newHeight = Math.max(100, newHeight); // Min height 100px

                // Forzar altura explícita
                activeResizeCard.style.height = newHeight + 'px';
                activeResizeCard.style.maxHeight = 'none';

                // Asegurar que el body crezca
                const body = activeResizeCard.querySelector('.action-card-body');
                if (body) {
                    body.style.maxHeight = 'none';
                    body.style.flex = '1';
                }
            }
        }

        function handleResizeEnd(e) {
            if (!isResizing) return;

            isResizing = false;
            resizeSide = null;
            activeResizeCard = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        // ═══════════════════════════════════════════════════════════════════
        // EVENT BINDINGS
        // ═══════════════════════════════════════════════════════════════════

        // Bind drag events al indicador
        indicatorA.addEventListener('mousedown', (e) => handleDragStart(e, wrapperA));
        indicatorB.addEventListener('mousedown', (e) => handleDragStart(e, wrapperB));

        // Bind resize events
        cardA.querySelector('.action-resize-left')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardA, 'left'));
        cardA.querySelector('.action-resize-right')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardA, 'right'));
        cardA.querySelector('.action-resize-bottom')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardA, 'bottom'));
        cardA.querySelector('.action-resize-bottom-left')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardA, 'bottom-left'));
        cardA.querySelector('.action-resize-bottom-right')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardA, 'bottom-right'));

        cardB.querySelector('.action-resize-left')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardB, 'left'));
        cardB.querySelector('.action-resize-right')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardB, 'right'));
        cardB.querySelector('.action-resize-bottom')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardB, 'bottom'));
        cardB.querySelector('.action-resize-bottom-left')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardB, 'bottom-left'));
        cardB.querySelector('.action-resize-bottom-right')?.addEventListener('mousedown', (e) => handleResizeStart(e, cardB, 'bottom-right'));

        // Global mouse events para drag y resize
        document.addEventListener('mousemove', (e) => {
            handleDragMove(e);
            handleResizeMove(e);
        });

        document.addEventListener('mouseup', (e) => {
            handleDragEnd(e);
            handleResizeEnd(e);
        });

        // Prevenir propagación de clicks durante drag
        actionContainer.addEventListener('click', (e) => {
            if (hasDragged) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);

        // Alternar entre tarjetas A y B
        let useCardA = true;
        let currentAction = null;

        function showActionCard(action) {
            // Determinar qué tarjeta usar (alternar)
            const activeWrapper = useCardA ? wrapperA : wrapperB;
            const activeIndicator = useCardA ? indicatorA : indicatorB;
            const activeNumText = useCardA ? numTextA : numTextB;
            const activeCard = useCardA ? cardA : cardB;
            const activeChip = useCardA ? chipA : chipB;
            const activeBody = useCardA ? bodyA : bodyB;

            const exitingWrapper = useCardA ? wrapperB : wrapperA;
            const exitingIndicator = useCardA ? indicatorB : indicatorA;
            const exitingNumText = useCardA ? numTextB : numTextA;

            // Determinar si hay tarjeta que debe salir
            const hasExitingCard = !!currentAction;

            // Si hay tarjeta visible, hacerla salir
            if (hasExitingCard) {
                // 1. Primero: marcar la saliente como success (cambiar icono)
                exitingIndicator.className = 'action-indicator success';
                exitingNumText.innerHTML = STATE_ICONS.check;

                // 2. Pequeño delay, luego animar salida
                setTimeout(() => {
                    exitingWrapper.classList.remove('visible');
                    exitingWrapper.classList.add('exiting');

                    // Limpiar después de la animación
                    setTimeout(() => {
                        exitingWrapper.classList.remove('exiting');
                    }, 350);
                }, 150);
            }

            // Preparar nueva tarjeta
            const { num, type, question, answer, options, selector } = action;
            currentAction = action;

            // Actualizar indicador
            // Para tipo "click" (navegación), usar icono en lugar de número
            if (type === 'click') {
                activeNumText.innerHTML = STATE_ICONS.click;
            } else {
                activeNumText.textContent = num;
            }
            activeIndicator.className = `action-indicator ${type} loading`;

            // Actualizar tarjeta
            activeChip.textContent = type.toUpperCase();
            activeChip.className = 'action-type-chip ' + type;
            activeCard.className = 'action-card ' + type;

            // Generar contenido
            let bodyHtml = `<div class="action-question">${escHtml(question)}</div>`;

            if (type === 'fill') {
                bodyHtml += `<div class="action-answer">${escHtml(answer)}</div>`;
            } else if (type === 'select' && options) {
                bodyHtml += '<div class="action-options">';
                options.forEach(opt => {
                    const isSelected = opt === answer;
                    bodyHtml += `<div class="action-opt ${isSelected ? 'selected' : ''}">${escHtml(opt)}</div>`;
                });
                bodyHtml += '</div>';
            } else if (type === 'click') {
                // Navegación: Usar estilo naranja para la respuesta
                bodyHtml += `<div class="action-answer" style="background: #fff7ed; border-color: #fdba74; color: #c2410c;">${escHtml(answer)}</div>`;
            }

            activeBody.innerHTML = bodyHtml;

            // Mostrar nueva tarjeta con delay si hay transición
            const entryDelay = hasExitingCard ? 150 : 0;
            setTimeout(() => {
                requestAnimationFrame(() => {
                    activeWrapper.classList.add('visible');
                });
            }, entryDelay);

            // Alternar para la próxima vez
            useCardA = !useCardA;
        }

        function setIndicatorState(state) {
            // Obtener la tarjeta activa actual (la opuesta a useCardA porque ya alternamos)
            const activeIndicator = useCardA ? indicatorB : indicatorA;
            const activeNumText = useCardA ? numTextB : numTextA;
            const type = currentAction ? currentAction.type : '';

            if (state === 'success') {
                activeIndicator.className = 'action-indicator success';
                activeNumText.innerHTML = STATE_ICONS.check;
            } else if (state === 'error') {
                activeIndicator.className = 'action-indicator error';
                activeNumText.innerHTML = STATE_ICONS.alert;
            } else {
                activeIndicator.className = `action - indicator ${type} loading`;
                activeNumText.textContent = currentAction ? currentAction.num : '';
            }
        }

        function hideActionCard() {
            wrapperA.classList.remove('visible');
            wrapperA.classList.add('exiting');
            wrapperB.classList.remove('visible');
            wrapperB.classList.add('exiting');

            setTimeout(() => {
                wrapperA.classList.remove('exiting');
                wrapperB.classList.remove('exiting');
                currentAction = null;
            }, 350);
        }

        // ═══════════════════════════════════════════════════════════════════
        // PANEL DE PREVIEW (usa datos reales del paquete)
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Genera lista de acciones para una fila específica usando datos reales del paquete
         */
        function getActionsForRow(rowIndex) {
            const rows = pkg.resolvedRows || [];
            const row = rows[rowIndex];
            if (!row) return [];

            const answers = row.answers || {};
            const questions = getAllQuestions();
            const actions = [];

            questions.forEach((q, idx) => {
                const answer = answers[q.key] || '';
                if (!answer) return; // Skip sin respuesta

                const selenium = q.selenium || {};
                const actionType = selenium.action || 'fill';

                const action = {
                    num: idx + 1,
                    type: actionType,
                    question: q.text || q.key,
                    answer: answer,
                    key: q.key
                };

                // Agregar opciones si es select
                if (actionType === 'select' && q.options) {
                    action.options = q.options.map(o => o.value || o.text || o);
                }

                // Agregar selector si es click
                if (actionType === 'click') {
                    action.selector = selenium.selector || selenium.fullSelector || '';
                }

                actions.push(action);
            });

            return actions;
        }

        // Renderizar panel de preview con datos reales
        function renderTestPanel() {
            const actions = getActionsForRow(config.currentRowIndex);

            if (actions.length === 0) {
                testPanelList.innerHTML = '<div style="padding: 12px; color: #9ca3af; text-align: center;">Sin acciones para esta fila</div>';
                return;
            }

            let html = actions.map(a => `
                <div class="test-action-item" data-action-index="${a.num - 1}">
                    <div class="test-action-num ${a.type}">${a.num}</div>
                    <div class="test-action-text">${escHtml(a.question)}</div>
                </div>
                `).join('');

            testPanelList.innerHTML = html;

            // Bind clicks para preview
            testPanelList.querySelectorAll('.test-action-item').forEach(item => {
                item.onclick = () => {
                    const idx = parseInt(item.dataset.actionIndex);
                    const actions = getActionsForRow(config.currentRowIndex);
                    if (actions[idx]) {
                        showActionCard(actions[idx]);
                    }
                };
            });
        }

        // ═══════════════════════════════════════════════════════════════════
        // PUBLIC API
        // ═══════════════════════════════════════════════════════════════════

        // Update status function (called by Python)
        window.__autoforms_updateStatus = function (status, message) {
            statusDot.className = 'status-dot ' + status;
            statusText.textContent = message || 'Listo';

            // Actualizar estado de automatización para bloquear/desbloquear drag/resize
            isAutomationRunning = (status === 'running');

            // Actualizar clase visual del indicador para reflejar estado
            if (isAutomationRunning) {
                indicatorA.style.cursor = 'default';
                indicatorB.style.cursor = 'default';
            } else {
                indicatorA.style.cursor = 'grab';
                indicatorB.style.cursor = 'grab';
            }
        };

        // Update current row (called by Python)
        window.__autoforms_setCurrentRow = function (rowIndex) {
            config.currentRowIndex = rowIndex;
            // Si el dropdown está abierto, re-renderizar
            if (config.dropdownOpen === 'rows' && config.controlColumns.length > 0) {
                renderRowsList();
            }
            // Actualizar panel de preview
            renderTestPanel();
        };

        // Get config (for Python to read)
        window.__autoforms_getConfig = function () {
            return config;
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

        // Show action card (called by Python during automation)
        window.__autoforms_showAction = function (action) {
            showActionCard(action);
        };

        // Set action indicator state: 'loading', 'success', 'error'
        window.__autoforms_setActionState = function (state) {
            setIndicatorState(state);
        };

        // Hide action card
        window.__autoforms_hideAction = function () {
            hideActionCard();
        };

        // Set automation running state (for blocking drag/resize)
        window.__autoforms_setRunning = function (running) {
            isAutomationRunning = running;

            if (isAutomationRunning) {
                indicatorA.style.cursor = 'default';
                indicatorB.style.cursor = 'default';
            } else {
                indicatorA.style.cursor = 'grab';
                indicatorB.style.cursor = 'grab';
            }
        };

        // ═══════════════════════════════════════════════════════════════════
        // SINCRONIZACIÓN COMPLETA DE ESTADO (llamado por Python)
        // ═══════════════════════════════════════════════════════════════════

        /**
         * Sincroniza el estado completo de la UI con Python.
         * Python es la fuente de verdad (source of truth).
         * 
         * @param {Object} state - Estado completo desde Python
         * @param {boolean} state.isRunning - Si la automatización está corriendo
         * @param {boolean} state.isPaused - Si está pausada
         * @param {number} state.currentRow - Índice de fila actual (0-based)
         * @param {number} state.totalRows - Total de filas
         * @param {Object} state.rowResults - Resultados por fila {idx: {status, success, url}}
         */
        window.__autoforms_syncState = function (state) {
            console.log('[AutoForms] 🔄 Syncing state from Python:', state);

            // ═══ 1. Sincronizar estado play/pause ═══
            if (typeof state.isPaused === 'boolean' && typeof state.isRunning === 'boolean') {
                const shouldBePlaying = state.isRunning && !state.isPaused;

                if (shouldBePlaying !== isPlaying) {
                    isPlaying = shouldBePlaying;

                    if (isPlaying) {
                        btnPlayPause.innerHTML = ICONS.pause;
                        btnPlayPause.classList.add('paused');
                        btnPlayPause.title = 'Pausar';
                    } else {
                        btnPlayPause.innerHTML = ICONS.play;
                        btnPlayPause.classList.remove('paused');
                        btnPlayPause.title = state.isPaused ? 'Reanudar' : 'Iniciar';
                    }
                    console.log('[AutoForms] Play/Pause synced:', isPlaying ? 'PLAYING' : 'PAUSED');
                }
            }

            // ═══ 2. Sincronizar fila actual ═══
            if (typeof state.currentRow === 'number') {
                config.currentRowIndex = state.currentRow;
                console.log('[AutoForms] Current row synced:', state.currentRow + 1);
            }

            // ═══ 3. Sincronizar resultados de filas ═══
            if (state.rowResults && typeof state.rowResults === 'object') {
                config.rowResults = state.rowResults;
                console.log('[AutoForms] Row results synced:', Object.keys(state.rowResults).length, 'rows');
            }

            // ═══ 4. Sincronizar estado running ═══
            if (typeof state.isRunning === 'boolean') {
                config.isRunning = state.isRunning;
                isAutomationRunning = state.isRunning;
            }

            // ═══ 5. Sincronizar estado paused ═══
            if (typeof state.isPaused === 'boolean') {
                config.isPaused = state.isPaused;
            }

            // ═══ 6. Re-renderizar UI si es necesario ═══
            if (config.dropdownOpen === 'rows' && config.controlColumns.length > 0) {
                renderRowsList();
            }

            // Actualizar panel de preview
            renderTestPanel();

            console.log('[AutoForms] ✓ State sync complete');
        };

        /**
         * Actualiza el resultado de una fila específica.
         * @param {number} rowIndex - Índice de la fila
         * @param {boolean} success - Si la fila se completó exitosamente
         * @param {string|null} url - URL capturada (si PostSubmit está activo)
         */
        window.__autoforms_updateRowResult = function (rowIndex, success, url) {
            config.rowResults[rowIndex] = {
                status: success ? 'success' : 'error',
                success: success,
                url: url || null
            };

            console.log('[AutoForms] Row', rowIndex + 1, 'result:', success ? '✓' : '✗', url ? 'URL: ' + url.substring(0, 30) + '...' : '');

            // Re-renderizar si el dropdown está abierto
            if (config.dropdownOpen === 'rows' && config.controlColumns.length > 0) {
                renderRowsList();
            }
        };

        /**
         * Fuerza el estado de play/pause desde Python.
         * Usar cuando Python inicia/pausa la automatización.
         */
        window.__autoforms_setPlayPauseState = function (playing) {
            isPlaying = playing;

            if (isPlaying) {
                btnPlayPause.innerHTML = ICONS.pause;
                btnPlayPause.classList.add('paused');
                btnPlayPause.title = 'Pausar';
            } else {
                btnPlayPause.innerHTML = ICONS.play;
                btnPlayPause.classList.remove('paused');
                btnPlayPause.title = 'Iniciar';
            }

            console.log('[AutoForms] Play/Pause set by Python:', playing ? 'PLAYING' : 'PAUSED');
        };

        // Show initial "Ready" state card
        function showReadyCard() {
            const readyAction = {
                num: '',
                type: 'click',  // Naranja
                question: '¡Preparado!',
                answer: 'Listo para iniciar automatización'
            };

            // Mostrar en tarjeta A
            chipA.textContent = 'READY';
            chipA.className = 'action-type-chip click';
            cardA.className = 'action-card click';
            indicatorA.className = 'action-indicator click';
            numTextA.innerHTML = STATE_ICONS.robot;
            bodyA.innerHTML = `
                <div class="action-question">¡Preparado!</div>
                    <div class="action-answer" style="background: #fff7ed; border-color: #fdba74; color: #c2410c;">
                        Arrastra el círculo para mover • Click para colapsar
                    </div>
            `;

            wrapperA.classList.add('visible');
        }

        // Mostrar tarjeta inicial al cargar
        showReadyCard();

        console.log('[AutoForms] Automation Bar ready');
        console.log('[AutoForms] Package:', pkg.filename, '|', pkg.totalRows, 'rows |', pkg.totalQuestions, 'questions');
    }

    // Execute
    waitForBody(createAutomationBar);
})();

