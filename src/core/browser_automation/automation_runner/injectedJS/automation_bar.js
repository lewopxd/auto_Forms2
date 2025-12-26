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
                    position: relative;
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
                
                .info-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    border: 1px solid #e5e7eb;
                    border-radius: 6px;
                    background: white;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    color: #374151;
                    font-size: 12px;
                }
                
                .info-btn:hover {
                    background: #f9fafb;
                    border-color: #d1d5db;
                }
                
                .info-btn.active {
                    background: #667eea;
                    border-color: #667eea;
                    color: white;
                }
                
                .info-btn svg {
                    width: 14px;
                    height: 14px;
                }
                
                .info-value {
                    font-weight: 600;
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
                   ROWS LIST (grid de filas)
                   ═══════════════════════════════════════════════════════════ */
                
                .rows-dropdown {
                    min-width: 450px;
                    max-width: 600px;
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
                   TARJETAS DE ACCIÓN (reutilizables)
                   ═══════════════════════════════════════════════════════════ */
                
                .action-card {
                    position: fixed;
                    top: 60px;
                    left: 16px;
                    width: 320px;
                    background: white;
                    border-radius: 8px;
                    border: 1px solid #d1d5db;
                    border-left-width: 4px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                    z-index: 9999;
                    opacity: 0;
                    transform: translateY(-20px);
                    pointer-events: none;
                }
                
                .action-card.visible {
                    opacity: 1;
                    transform: translateY(0);
                    pointer-events: auto;
                    animation: cardEnter 0.3s ease-out;
                }
                
                .action-card.exiting {
                    animation: cardExit 0.3s ease-in forwards;
                }
                
                @keyframes cardEnter {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes cardExit {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(-100px);
                    }
                }
                
                /* Tipos de tarjeta */
                .action-card.fill { border-left-color: #3b82f6; }
                .action-card.select { border-left-color: #8b5cf6; }
                .action-card.click { border-left-color: #f97316; }
                
                .action-card-header {
                    display: flex;
                    align-items: center;
                    padding: 8px 12px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    gap: 10px;
                }
                
                .action-num {
                    width: 26px;
                    height: 26px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 700;
                    color: white;
                    flex-shrink: 0;
                }
                
                .action-card.fill .action-num { background: #3b82f6; }
                .action-card.select .action-num { background: #8b5cf6; }
                .action-card.click .action-num { background: #f97316; }
                
                .action-type-chip {
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .action-type-chip.fill { background: #dbeafe; color: #1e40af; }
                .action-type-chip.select { background: #ede9fe; color: #5b21b6; }
                .action-type-chip.click { background: #ffedd5; color: #c2410c; }
                
                .action-card-body {
                    padding: 12px;
                }
                
                .action-question {
                    font-size: 13px;
                    font-weight: 600;
                    color: #1f2937;
                    line-height: 1.4;
                    margin-bottom: 8px;
                }
                
                .action-answer {
                    font-size: 12px;
                    color: #059669;
                    background: #ecfdf5;
                    padding: 8px 10px;
                    border-radius: 4px;
                    border: 1px solid #a7f3d0;
                }
                
                .action-options {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                
                .action-opt {
                    font-size: 11px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    color: #6b7280;
                    background: #f3f4f6;
                }
                
                .action-opt.selected {
                    background: #8b5cf6;
                    color: white;
                    font-weight: 600;
                }
                
                .action-selector {
                    font-size: 11px;
                    padding: 6px 8px;
                    background: #fff7ed;
                    border: 1px dashed #f97316;
                    border-radius: 4px;
                    color: #c2410c;
                    font-family: monospace;
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
                
                <!-- Questions Info -->
                <div class="section">
                    ${ICONS.questions}
                    <span style="color: #6b7280; font-size: 12px;"><span class="info-value" style="color: #374151;">${pkg.totalQuestions}</span> preguntas</span>
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
            
            <!-- Tarjeta de Acción (reutilizable) -->
            <div class="action-card" id="actionCard">
                <div class="action-card-header">
                    <div class="action-num" id="actionNum">1</div>
                    <span class="action-type-chip" id="actionTypeChip">FILL</span>
                </div>
                <div class="action-card-body" id="actionCardBody">
                    <!-- Contenido dinámico -->
                </div>
            </div>
            
            <!-- Panel de Prueba -->
            <div class="test-panel visible" id="testPanel">
                <div class="test-panel-header">Test Acciones</div>
                <div class="test-panel-list" id="testPanelList">
                    <!-- Se llena dinámicamente -->
                </div>
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
        const btnRows = shadow.getElementById('btnRows');
        const rowsDropdown = shadow.getElementById('rowsDropdown');
        const statusDot = shadow.getElementById('statusDot');
        const statusText = shadow.getElementById('statusText');

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

            // Calcular grid-template-columns dinámicamente (agregamos columna para botón view)
            const gridCols = `42px repeat(${numCols}, 1fr) 36px`;

            let rowsHtml = rows.map((row, idx) => {
                const values = getRowControlValues(row);
                const isCurrent = idx === config.currentRowIndex;

                let valuesHtml = values.map(v => `<span class="row-value">${escHtml(v)}</span>`).join('');

                return `
                    <div class="row-item ${isCurrent ? 'current' : ''}" 
                         data-index="${idx}"
                         style="grid-template-columns: ${gridCols};">
                        <span class="row-index">${idx + 1}</span>
                        ${valuesHtml}
                        <button class="view-btn" data-view-index="${idx}" title="Ver formulario completo">${ICONS.eye}</button>
                    </div>
                `;
            }).join('');

            // Header con nombres de columnas (+ columna vacía para el botón)
            const headerCols = config.controlColumns.map(c => {
                const shortText = c.text.length > 20 ? c.text.substring(0, 17) + '...' : c.text;
                return `<span class="row-value" style="font-weight: 600; color: #667eea;">${escHtml(shortText)}</span>`;
            }).join('');

            rowsDropdown.className = 'dropdown rows-dropdown open';
            rowsDropdown.innerHTML = `
                <div class="dropdown-header">
                    <div class="dropdown-title">Filas del paquete (${rows.length})</div>
                    <div class="dropdown-subtitle">
                        Haz clic en una fila para saltar a ella. Fila actual: <strong>${config.currentRowIndex + 1}</strong>
                    </div>
                </div>
                <div class="dropdown-content">
                    <!-- Header -->
                    <div class="row-item" style="grid-template-columns: ${gridCols}; background: #e0e7ff; cursor: default;">
                        <span class="row-index" style="background: #5a67d8;">#</span>
                        ${headerCols}
                        <span></span>
                    </div>
                    <div class="rows-grid">
                        ${rowsHtml}
                    </div>
                </div>
                <div class="dropdown-footer">
                    <button class="dropdown-btn dropdown-btn-secondary" id="btnReconfigure">
                        ⚙️ Cambiar columnas
                    </button>
                    <button class="dropdown-btn dropdown-btn-primary" id="btnCloseRows">
                        Cerrar
                    </button>
                </div>
            `;

            // Bind row click events (excluir clicks en el botón view)
            rowsDropdown.querySelectorAll('.row-item[data-index]').forEach(item => {
                item.addEventListener('click', (e) => {
                    // Si el click fue en el botón view, no hacer nada aquí
                    if (e.target.closest('.view-btn')) return;

                    const idx = parseInt(item.dataset.index);
                    config.currentRowIndex = idx;
                    window.__autoforms_commands.push({
                        type: 'jump_to_row',
                        rowIndex: idx,
                        time: Date.now()
                    });
                    console.log('[AutoForms] Jump to row:', idx + 1);
                    renderRowsList(); // Re-render to update current
                });
            });

            // Bind view button events
            rowsDropdown.querySelectorAll('.view-btn[data-view-index]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.viewIndex);
                    showFormModal(idx);
                });
            });

            // Reconfigure button
            rowsDropdown.querySelector('#btnReconfigure').addEventListener('click', () => {
                config.controlColumns = [];
                renderColumnSelector();
            });

            // Close button
            rowsDropdown.querySelector('#btnCloseRows').addEventListener('click', closeDropdown);
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
            modalTitle.textContent = `Formulario Fila #${rowIndex + 1}`;
            modalSubtitle.textContent = `${questions.length} preguntas`;

            // Group questions by page
            const questionsByPage = {};
            if (pkg.instructions && pkg.instructions.pages) {
                pkg.instructions.pages.forEach(page => {
                    const pageKey = page.pageKey || `page_${page.pageNumber}`;
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
                    const target = modalContent.querySelector(`#${targetId}`);
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
            config.dropdownOpen = null;
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

        // ═══════════════════════════════════════════════════════════════════
        // SISTEMA DE TARJETAS DE ACCIÓN
        // ═══════════════════════════════════════════════════════════════════

        const actionCard = shadow.getElementById('actionCard');
        const actionNum = shadow.getElementById('actionNum');
        const actionTypeChip = shadow.getElementById('actionTypeChip');
        const actionCardBody = shadow.getElementById('actionCardBody');
        const testPanel = shadow.getElementById('testPanel');
        const testPanelList = shadow.getElementById('testPanelList');

        let currentActionTimeout = null;

        // Función para mostrar una tarjeta de acción
        function showActionCard(action) {
            // Limpiar timeout anterior
            if (currentActionTimeout) {
                clearTimeout(currentActionTimeout);
            }

            // Si hay tarjeta visible, animarla saliendo
            if (actionCard.classList.contains('visible')) {
                actionCard.classList.remove('visible');
                actionCard.classList.add('exiting');

                setTimeout(() => {
                    actionCard.classList.remove('exiting');
                    displayAction(action);
                }, 300);
            } else {
                displayAction(action);
            }
        }

        function displayAction(action) {
            const { num, type, question, answer, options, selector } = action;

            // Actualizar header
            actionNum.textContent = num;
            actionTypeChip.textContent = type.toUpperCase();
            actionTypeChip.className = 'action-type-chip ' + type;
            actionCard.className = 'action-card ' + type;

            // Generar contenido según tipo
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
            } else if (type === 'click' && selector) {
                bodyHtml += `<div class="action-selector">${escHtml(selector)}</div>`;
            }

            actionCardBody.innerHTML = bodyHtml;

            // Mostrar con animación
            setTimeout(() => {
                actionCard.classList.add('visible');
            }, 10);
        }

        function hideActionCard() {
            actionCard.classList.remove('visible');
            actionCard.classList.add('exiting');

            setTimeout(() => {
                actionCard.classList.remove('exiting');
            }, 300);
        }

        // ═══════════════════════════════════════════════════════════════════
        // PANEL DE PRUEBA (con acciones demo)
        // ═══════════════════════════════════════════════════════════════════

        const demoActions = [
            { num: 1, type: 'fill', question: 'Nombre completo del beneficiario', answer: 'Juan Carlos Pérez García' },
            { num: 2, type: 'fill', question: 'Número de documento de identidad', answer: '1024567890' },
            { num: 3, type: 'select', question: 'Tipo de documento', answer: 'Cédula de ciudadanía', options: ['Cédula de ciudadanía', 'Tarjeta de identidad', 'Pasaporte', 'Cédula de extranjería'] },
            { num: 4, type: 'select', question: '¿Tiene alguna discapacidad?', answer: 'No', options: ['Sí', 'No'] },
            { num: 5, type: 'fill', question: 'Dirección de residencia actual', answer: 'Calle 123 #45-67, Barrio Centro' },
            { num: 6, type: 'click', question: 'Continuar al siguiente paso', selector: '[data-automation-id="nextButton"]' },
            { num: 7, type: 'fill', question: 'Correo electrónico', answer: 'juan.perez@email.com' },
            { num: 8, type: 'select', question: 'Nivel de escolaridad', answer: 'Universitario', options: ['Primaria', 'Secundaria', 'Técnico', 'Universitario', 'Posgrado'] },
            { num: 9, type: 'click', question: 'Enviar formulario', selector: '[data-automation-id="submitButton"]' }
        ];

        // Renderizar panel de prueba
        function renderTestPanel() {
            let html = demoActions.map(a => `
                <div class="test-action-item" data-action-index="${a.num - 1}">
                    <div class="test-action-num ${a.type}">${a.num}</div>
                    <div class="test-action-text">${escHtml(a.question)}</div>
                </div>
            `).join('');

            testPanelList.innerHTML = html;

            // Bind clicks
            testPanelList.querySelectorAll('.test-action-item').forEach(item => {
                item.onclick = () => {
                    const idx = parseInt(item.dataset.actionIndex);
                    showActionCard(demoActions[idx]);
                };
            });
        }

        // Renderizar al iniciar
        renderTestPanel();

        // ═══════════════════════════════════════════════════════════════════
        // PUBLIC API
        // ═══════════════════════════════════════════════════════════════════

        // Update status function (called by Python)
        window.__autoforms_updateStatus = function (status, message) {
            statusDot.className = 'status-dot ' + status;
            statusText.textContent = message || 'Listo';
        };

        // Update current row (called by Python)
        window.__autoforms_setCurrentRow = function (rowIndex) {
            config.currentRowIndex = rowIndex;
            // Si el dropdown está abierto, re-renderizar
            if (config.dropdownOpen === 'rows' && config.controlColumns.length > 0) {
                renderRowsList();
            }
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

        // Hide action card
        window.__autoforms_hideAction = function () {
            hideActionCard();
        };

        console.log('[AutoForms] Automation Bar ready');
        console.log('[AutoForms] Package:', pkg.filename, '|', pkg.totalRows, 'rows |', pkg.totalQuestions, 'questions');
    }

    // Execute
    waitForBody(createAutomationBar);
})();
