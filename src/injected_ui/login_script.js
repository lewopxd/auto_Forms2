/**
 * Login Mode UI - Wait for user authentication
 * Consistent design with record mode panel (script.js)
 * Uses Shadow DOM and command queue for Python communication
 */

(function () {
    'use strict';

    const ROOT_ID = '__msfa_login_root__';

    if (document.getElementById(ROOT_ID)) return;

    // Command queue for Python (shared with record mode)
    window.__msfa_commands = window.__msfa_commands || [];

    // SVG Icons (same style as record mode)
    const ICONS = {
        lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
        check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`
    };

    const host = document.createElement('div');
    host.id = ROOT_ID;
    host.style.cssText = 'position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;z-index:2147483647!important;pointer-events:none!important;';

    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            
            :host {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: auto;
            }
            
            .panel {
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(0, 0, 0, 0.12);
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
                width: 380px;
                overflow: hidden;
                animation: slideIn 0.3s ease-out;
            }
            
            @keyframes slideIn {
                from { opacity: 0; transform: scale(0.95) translateY(-10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            
            .header {
                display: flex; 
                align-items: center;
                padding: 16px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            
            .header-icon { 
                width: 24px; 
                height: 24px; 
                color: white; 
                margin-right: 12px; 
            }
            
            .header-title { 
                flex: 1; 
                font-size: 16px; 
                font-weight: 600; 
                color: white; 
            }
            
            .body { 
                padding: 28px 24px; 
                text-align: center;
            }
            
            .spinner-container {
                margin-bottom: 20px;
            }
            
            .spinner {
                width: 48px;
                height: 48px;
                color: #667eea;
                animation: spin 1s linear infinite;
                margin: 0 auto;
            }
            
            @keyframes spin { 
                from { transform: rotate(0deg); } 
                to { transform: rotate(360deg); } 
            }
            
            .instruction {
                font-size: 18px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 12px;
            }
            
            .warning {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: #fef3c7;
                color: #92400e;
                padding: 10px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 12px;
                border: 1px solid #fcd34d;
            }
            
            .warning svg {
                width: 16px;
                height: 16px;
                color: #f59e0b;
                flex-shrink: 0;
            }
            
            .hint {
                font-size: 12px;
                color: #64748b;
                margin-bottom: 0;
            }
            
            .footer {
                padding: 16px 24px;
                background: #f8fafc;
                border-top: 1px solid #e2e8f0;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                border: none;
                border-radius: 8px;
                padding: 12px 16px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.15s ease;
            }
            
            .btn svg { 
                width: 16px; 
                height: 16px; 
            }
            
            .btn-primary { 
                background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                color: white; 
                box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
            }
            
            .btn-primary:hover { 
                background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
            }
            
            .btn-secondary { 
                background: transparent;
                color: #64748b;
                border: 1px solid #e2e8f0;
            }
            
            .btn-secondary:hover { 
                background: #f1f5f9;
                color: #475569;
            }
            
            /* Timeout warning overlay */
            .timeout-overlay {
                position: absolute;
                inset: 0;
                background: rgba(255, 255, 255, 0.95);
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 24px;
                text-align: center;
                z-index: 10;
            }
            
            .timeout-overlay.visible {
                display: flex;
            }
            
            .timeout-title {
                font-size: 15px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 8px;
            }
            
            .timeout-text {
                font-size: 13px;
                color: #64748b;
                margin-bottom: 16px;
            }
            
            .timeout-actions {
                display: flex;
                gap: 10px;
            }
            
            .timeout-btn {
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                border: none;
            }
            
            .timeout-btn-continue {
                background: #667eea;
                color: white;
            }
            
            .timeout-btn-cancel {
                background: #f1f5f9;
                color: #64748b;
            }
        </style>
        
        <div class="overlay">
            <div class="panel">
                <div class="header">
                    <span class="header-icon">${ICONS.lock}</span>
                    <span class="header-title">Modo Login</span>
                </div>
                
                <div class="body">
                    <div class="spinner-container">
                        <div class="spinner">${ICONS.spinner}</div>
                    </div>
                    
                    <p class="instruction">Inicia sesión en tu cuenta</p>
                    
                    <div class="warning">
                        ${ICONS.warning}
                        <span>NO cierres esta pestaña</span>
                    </div>
                    
                    <p class="hint">La página puede recargar durante el login</p>
                </div>
                
                <div class="footer">
                    <button class="btn btn-primary" id="btnContinue">
                        ${ICONS.check}
                        <span>Ya inicié sesión - Continuar</span>
                    </button>
                    <button class="btn btn-secondary" id="btnCancel">
                        ${ICONS.close}
                        <span>Cancelar Grabación</span>
                    </button>
                </div>
                
                <!-- Timeout warning (hidden by default) -->
                <div class="timeout-overlay" id="timeoutOverlay">
                    <div class="timeout-title">¿Sigues ahí?</div>
                    <div class="timeout-text">Han pasado 5 minutos esperando el login</div>
                    <div class="timeout-actions">
                        <button class="timeout-btn timeout-btn-continue" id="btnTimeoutContinue">Seguir esperando</button>
                        <button class="timeout-btn timeout-btn-cancel" id="btnTimeoutCancel">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(host);

    // Get elements
    const btnContinue = shadow.getElementById('btnContinue');
    const btnCancel = shadow.getElementById('btnCancel');
    const timeoutOverlay = shadow.getElementById('timeoutOverlay');
    const btnTimeoutContinue = shadow.getElementById('btnTimeoutContinue');
    const btnTimeoutCancel = shadow.getElementById('btnTimeoutCancel');

    // Continue button - Login complete
    btnContinue.onclick = () => {
        window.__msfa_commands.push({ type: 'login_done', time: Date.now() });
        host.remove();
    };

    // Cancel button - Stop recording
    btnCancel.onclick = () => {
        window.__msfa_commands.push({ type: 'stop', save: false });
        host.remove();
    };

    // Timeout overlay handlers
    btnTimeoutContinue.onclick = () => {
        timeoutOverlay.classList.remove('visible');
    };

    btnTimeoutCancel.onclick = () => {
        window.__msfa_commands.push({ type: 'stop', save: false });
        host.remove();
    };

    // Expose function for Python to show timeout warning
    window.__msfa_showTimeoutWarning = function () {
        if (timeoutOverlay) {
            timeoutOverlay.classList.add('visible');
        }
    };

    console.log('[MSFA] Login Mode UI ready');
})();
