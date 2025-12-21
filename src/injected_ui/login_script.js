/**
 * Login Mode UI - Wait for user authentication
 * Small corner panel (like recording mode) - does NOT block page interaction
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
        spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
        collapse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>`,
        expand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`
    };

    // Create floating panel (same position as recording panel)
    const host = document.createElement('div');
    host.id = ROOT_ID;
    host.style.cssText = 'position:fixed!important;top:20px!important;right:20px!important;z-index:2147483647!important;';

    const shadow = host.attachShadow({ mode: 'closed' });

    shadow.innerHTML = `
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            
            :host {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .panel {
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(0, 0, 0, 0.12);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
                width: 320px;
                overflow: hidden;
                animation: slideIn 0.3s ease-out;
            }
            
            .panel.collapsed { height: auto !important; }
            
            @keyframes slideIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .header {
                display: flex; 
                align-items: center;
                padding: 12px 16px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                cursor: move;
                user-select: none;
            }
            
            .header-icon { 
                width: 20px; 
                height: 20px; 
                color: white; 
                margin-right: 10px; 
            }
            
            .header-title { 
                flex: 1; 
                font-size: 15px; 
                font-weight: 600; 
                color: white; 
            }
            
            .header-btn {
                width: 28px; height: 28px; border: none;
                background: rgba(255,255,255,0.2); border-radius: 6px;
                cursor: pointer; display: flex; align-items: center;
                justify-content: center; margin-left: 6px;
            }
            .header-btn:hover { background: rgba(255,255,255,0.3); }
            .header-btn svg { width: 14px; height: 14px; color: white; }
            
            .body { 
                padding: 16px;
            }
            
            .body.hidden { display: none; }
            
            .spinner-row {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 12px;
            }
            
            .spinner {
                width: 24px;
                height: 24px;
                color: #667eea;
                animation: spin 1s linear infinite;
                flex-shrink: 0;
            }
            
            @keyframes spin { 
                from { transform: rotate(0deg); } 
                to { transform: rotate(360deg); } 
            }
            
            .instruction {
                font-size: 14px;
                font-weight: 600;
                color: #1e293b;
            }
            
            .warning {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #fef3c7;
                color: #92400e;
                padding: 10px 12px;
                border-radius: 8px;
                font-size: 12px;
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
                font-size: 11px;
                color: #64748b;
                margin-bottom: 16px;
                text-align: center;
            }
            
            .buttons {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                border: none;
                border-radius: 6px;
                padding: 10px 14px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.15s ease;
            }
            
            .btn svg { 
                width: 14px; 
                height: 14px; 
            }
            
            .btn-primary { 
                background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                color: white; 
            }
            
            .btn-primary:hover { 
                background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
            }
            
            .btn-secondary { 
                background: #f1f5f9;
                color: #64748b;
            }
            
            .btn-secondary:hover { 
                background: #e2e8f0;
            }
        </style>
        
        <div class="panel" id="panel">
            <div class="header" id="header">
                <span class="header-icon">${ICONS.lock}</span>
                <span class="header-title">Modo Login</span>
                <button class="header-btn" id="collapseBtn" title="Colapsar">${ICONS.collapse}</button>
            </div>
            
            <div class="body" id="body">
                <div class="spinner-row">
                    <div class="spinner">${ICONS.spinner}</div>
                    <span class="instruction">Inicia sesión en tu cuenta</span>
                </div>
                
                <div class="warning">
                    ${ICONS.warning}
                    <span>NO cierres esta pestaña</span>
                </div>
                
                <p class="hint">La página puede recargar durante el login.<br>Cuando termines, haz clic en continuar.</p>
                
                <div class="buttons">
                    <button class="btn btn-primary" id="btnContinue">
                        ${ICONS.check}
                        <span>Ya inicié sesión - Continuar</span>
                    </button>
                    <button class="btn btn-secondary" id="btnCancel">
                        ${ICONS.close}
                        <span>Cancelar</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(host);

    // Get elements
    const panel = shadow.getElementById('panel');
    const header = shadow.getElementById('header');
    const body = shadow.getElementById('body');
    const collapseBtn = shadow.getElementById('collapseBtn');
    const btnContinue = shadow.getElementById('btnContinue');
    const btnCancel = shadow.getElementById('btnCancel');

    // Collapse/Expand
    let collapsed = false;
    collapseBtn.onclick = () => {
        collapsed = !collapsed;
        body.classList.toggle('hidden', collapsed);
        panel.classList.toggle('collapsed', collapsed);
        collapseBtn.innerHTML = collapsed ? ICONS.expand : ICONS.collapse;
    };

    // Drag Logic (same as recording panel)
    let dragging = false, ox = 0, oy = 0;
    header.onmousedown = (e) => {
        if (e.target.closest('.header-btn')) return;
        dragging = true;
        const rect = host.getBoundingClientRect();
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;
        e.preventDefault();
    };
    document.onmousemove = (e) => {
        if (!dragging) return;
        const panelRect = panel.getBoundingClientRect();
        let newX = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - panelRect.width));
        let newY = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - panelRect.height));
        host.style.left = newX + 'px';
        host.style.right = 'auto';
        host.style.top = newY + 'px';
    };
    document.onmouseup = () => dragging = false;

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

    // Expose function for Python to show timeout warning (optional)
    window.__msfa_showTimeoutWarning = function () {
        // Could add a visual indicator here if needed
        console.log('[MSFA] Login timeout warning');
    };

    console.log('[MSFA] Login Mode UI ready (corner panel)');
})();
