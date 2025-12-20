/**
 * Record Mode UI - Clean Design with Command Queue
 * Uses global variable for Python communication instead of console.log
 */

(function () {
    'use strict';

    const ROOT_ID = '__msfa_root__';

    if (document.getElementById(ROOT_ID)) return;

    // Command queue for Python
    window.__msfa_commands = window.__msfa_commands || [];

    // SVG Icons
    const ICONS = {
        record: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
        collapse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>`,
        expand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`,
        check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
        spinner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
        save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        analyze: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`,
        stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>`,
        required: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>`,
        chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`
    };

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
                min-width: 200px;
                width: 400px;
                max-height: calc(100vh - 40px);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                resize: both;
            }
            
            .panel.collapsed { height: auto !important; min-height: 48px; resize: none; }
            
            .header {
                display: flex; align-items: center;
                padding: 12px 16px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                cursor: move; user-select: none; flex-shrink: 0;
            }
            
            .header-icon { width: 20px; height: 20px; color: white; margin-right: 10px; }
            .header-title { flex: 1; font-size: 15px; font-weight: 600; color: white; }
            
            .header-btn {
                width: 28px; height: 28px; border: none;
                background: rgba(255,255,255,0.2); border-radius: 6px;
                cursor: pointer; display: flex; align-items: center;
                justify-content: center; margin-left: 6px;
            }
            .header-btn:hover { background: rgba(255,255,255,0.3); }
            .header-btn svg { width: 14px; height: 14px; color: white; }
            
            .body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
            .body.hidden { display: none; }
            
            .content { flex: 1; padding: 12px 16px; overflow-y: auto; color: #1e293b; }
            
            .loading {
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                padding: 32px 20px; color: #64748b;
            }
            .loading svg { width: 32px; height: 32px; color: #667eea; animation: spin 1s linear infinite; }
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .loading-text { margin-top: 12px; font-size: 14px; }
            
            .question-list { list-style: none; }
            
            .question-item {
                padding: 10px 12px; margin-bottom: 8px;
                background: #f8fafc; border: 1px solid #e2e8f0;
                border-radius: 8px;
            }
            .question-item:hover { background: #f1f5f9; }
            
            .question-num {
                width: 26px; height: 26px;
                background: #667eea; color: white;
                border-radius: 6px; display: flex;
                align-items: center; justify-content: center;
                font-size: 12px; font-weight: 600;
                margin-right: 10px; flex-shrink: 0;
            }
            
            .question-text { font-size: 13px; color: #334155; word-break: break-word; font-weight: 500; }
            
            .footer {
                padding: 10px 16px;
                background: #f1f5f9;
                border-top: 1px solid #e2e8f0;
                display: flex; align-items: center; justify-content: flex-end;
                gap: 10px; flex-shrink: 0;
            }
            
            .btn {
                display: flex; align-items: center; gap: 6px;
                border: none; border-radius: 6px;
                padding: 8px 14px; cursor: pointer;
                font-size: 13px; font-weight: 600;
            }
            .btn svg { width: 14px; height: 14px; }
            .btn-primary { background: #667eea; color: white; }
            .btn-primary:hover { background: #5a67d8; }
            .btn-success { background: #22c55e; color: white; }
            .btn-success:hover { background: #16a34a; }
            .btn-danger { background: #e53e3e; color: white; }
            .btn-danger:hover { background: #c53030; }
            
            /* Stop Confirmation Modal */
            .confirm-overlay {
                position: absolute; inset: 0;
                background: rgba(255,255,255,0.95);
                display: none; flex-direction: column;
                align-items: center; justify-content: center;
                z-index: 10; padding: 20px; text-align: center;
            }
            .confirm-overlay.visible { display: flex; }
            .confirm-title { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
            .confirm-text { font-size: 13px; color: #64748b; margin-bottom: 20px; }
            .confirm-actions { display: flex; gap: 10px; }
            .checkbox-label {
                display: flex; align-items: center; gap: 8px;
                font-size: 13px; color: #475569; margin-bottom: 20px;
            }

            .hidden { display: none !important; }
        </style>
        
        <div class="panel" id="panel">
            <div class="header" id="header">
                <span class="header-icon">${ICONS.record}</span>
                <span class="header-title">Form Recording</span>
                <button class="header-btn" id="collapseBtn" title="Collapse">${ICONS.collapse}</button>
                <button class="header-btn" id="stopBtnTop" title="Stop Recording">${ICONS.stop}</button>
            </div>
            
            <div class="body" id="body">
                <div class="content" id="content">
                    <div class="loading" id="loading">
                        ${ICONS.spinner}
                        <span class="loading-text">Analyzing form...</span>
                    </div>
                    <ul class="question-list hidden" id="questionList"></ul>
                </div>

                <div class="confirm-overlay" id="confirmOverlay">
                    <div class="confirm-title">Finalizar Grabación</div>
                    <div class="confirm-text">Se guardará como: <span id="filenameDisplay" style="font-weight:600">recording.raf</span></div>
                    
                    <label class="checkbox-label">
                        <input type="checkbox" id="closeBrowserCheck" checked>
                        Cerrar navegador al finalizar
                    </label>
                    
                    <div class="confirm-actions">
                        <button class="btn btn-primary" id="cancelStopBtn">Cancelar</button>
                        <button class="btn btn-danger" id="confirmStopBtn">Finalizar</button>
                    </div>
                </div>
                
                <div class="footer hidden" id="footer">
                    <button class="btn btn-primary" id="analyzeBtn">${ICONS.analyze} Analyze</button>
                    <button class="btn btn-success" id="saveBtn">${ICONS.save} Registrar</button>
                    <button class="btn btn-danger" id="stopBtn">${ICONS.stop} Detener</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(host);

    const panel = shadow.getElementById('panel');
    const header = shadow.getElementById('header');
    const body = shadow.getElementById('body');
    const collapseBtn = shadow.getElementById('collapseBtn');

    // UI Elements
    const loading = shadow.getElementById('loading');
    const questionList = shadow.getElementById('questionList');
    const footer = shadow.getElementById('footer');

    // Buttons
    const analyzeBtn = shadow.getElementById('analyzeBtn');
    const saveBtn = shadow.getElementById('saveBtn');
    const stopBtn = shadow.getElementById('stopBtn');
    const stopBtnTop = shadow.getElementById('stopBtnTop');

    // Confirmation
    const confirmOverlay = shadow.getElementById('confirmOverlay');
    const filenameDisplay = shadow.getElementById('filenameDisplay');
    const closeBrowserCheck = shadow.getElementById('closeBrowserCheck');
    const cancelStopBtn = shadow.getElementById('cancelStopBtn');
    const confirmStopBtn = shadow.getElementById('confirmStopBtn');

    let formData = null;
    let hasAnalyzed = false;
    let lastSavedPage = null;

    // Auto-save function (Always active in memory)
    function triggerAutoSave() {
        if (!formData) return;
        const currentPage = formData.pageInfo?.current;
        if (currentPage !== lastSavedPage) {
            lastSavedPage = currentPage;
            window.__msfa_commands.push({ type: 'save', data: formData, time: Date.now() });
        }
    }

    shadow.getElementById('stopBtnTop').onclick = () => showStopConfirm();

    let collapsed = false;
    collapseBtn.onclick = () => {
        collapsed = !collapsed;
        body.classList.toggle('hidden', collapsed);
        panel.classList.toggle('collapsed', collapsed);
        collapseBtn.innerHTML = collapsed ? ICONS.expand : ICONS.collapse;
    };

    // Drag Logic
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

    // Analyze button
    analyzeBtn.onclick = () => {
        loading.classList.remove('hidden');
        questionList.classList.add('hidden');
        window.__msfa_commands.push({ type: 'analyze', time: Date.now() });
    };

    // Save/Register button
    saveBtn.onclick = () => {
        if (formData) {
            window.__msfa_commands.push({ type: 'save', data: formData, time: Date.now() });
            // Visual feedback could be added here
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = `${ICONS.check} Registrado`;
            setTimeout(() => saveBtn.innerHTML = originalText, 1000);
        }
    };

    // Stop Flow
    stopBtn.onclick = () => showStopConfirm();

    function showStopConfirm() {
        // Try to get filename from meta if available, else default
        filenameDisplay.textContent = window.__msfa_filename || 'formulario_auto.raf';
        confirmOverlay.classList.add('visible');
    }

    cancelStopBtn.onclick = () => confirmOverlay.classList.remove('visible');

    confirmStopBtn.onclick = () => {
        confirmOverlay.classList.remove('visible');
        window.__msfa_commands.push({
            type: 'stop',
            save: true,
            close_browser: closeBrowserCheck.checked
        });
    };

    // API
    window.__msfa_setFormData = function (data) {
        formData = data;
        hasAnalyzed = true;

        // Update Analyze Button Text
        analyzeBtn.innerHTML = `${ICONS.analyze} Re-Analyze`;

        loading.classList.add('hidden');
        questionList.classList.remove('hidden');
        footer.classList.remove('hidden');

        questionList.innerHTML = '';
        data.questions.forEach((q, idx) => {
            const li = document.createElement('li');
            li.className = 'question-item';

            li.innerHTML = `
                <div style="display:flex; align-items:center">
                    <span class="question-num">${q.num}</span>
                    <span class="question-text">${q.text || 'Untitled'}</span>
                </div>
            `;
            questionList.appendChild(li);
        });

        // Trigger auto-save to memory
        triggerAutoSave();
    };

    window.__msfa_setQuestions = window.__msfa_setFormData;

    // Auto-analyze when Next/Back buttons are clicked (using event delegation)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-automation-id="nextButton"], [data-automation-id="backButton"]');
        if (!btn) return;

        // Show spinner immediately
        loading.classList.remove('hidden');
        questionList.classList.add('hidden');
        statusText.textContent = 'Page changing...';
        statusSaved.textContent = '';

        // Wait for page transition then analyze
        setTimeout(() => {
            statusText.textContent = 'Analyzing...';
            window.__msfa_commands.push({ type: 'analyze', time: Date.now() });
        }, 1500);
    }, true);

    // Branch detection - track current questions and detect new ones after radio selection

    function getCurrentQuestionIds() {
        const ids = [];
        document.querySelectorAll('[data-automation-id="questionItem"]').forEach(item => {
            const idEl = item.querySelector('[id^="QuestionId_"]');
            if (idEl) {
                const match = idEl.id.match(/QuestionId_([a-zA-Z0-9]+)/);
                if (match) ids.push(match[1]);
            }
        });
        return ids;
    }

    // Listen for radio button clicks to detect branches
    document.addEventListener('click', (e) => {
        const radio = e.target.closest('[data-automation-id="radio"], [data-automation-id="choiceItem"]');
        if (!radio) return;

        // Get the value of the clicked option
        const valueSpan = radio.closest('[data-automation-id="choiceItem"]')?.querySelector('[data-automation-value]');
        const optionValue = valueSpan ? valueSpan.getAttribute('data-automation-value') : null;

        // Get parent question ID
        const questionItem = radio.closest('[data-automation-id="questionItem"]');
        const questionIdEl = questionItem?.querySelector('[id^="QuestionId_"]');
        const questionId = questionIdEl ? questionIdEl.id.replace('QuestionId_', '') : null;

        if (!optionValue || !questionId) return;

        // Store current question IDs before the DOM updates
        const questionsBefore = getCurrentQuestionIds();

        // Wait for MS Forms to potentially reveal new questions
        setTimeout(() => {
            const questionsAfter = getCurrentQuestionIds();

            // Find newly revealed questions
            const revealed = questionsAfter.filter(id => !questionsBefore.includes(id));

            if (revealed.length > 0) {
                // This option triggers a branch!
                if (!branchData[questionId]) branchData[questionId] = {};
                branchData[questionId][optionValue] = revealed;

                // Update formData
                if (formData && formData.questions) {
                    formData.questions.forEach(q => {
                        if (q.questionId === questionId && q.options) {
                            q.options.forEach(opt => {
                                if (opt.text === optionValue || opt.value === optionValue) {
                                    opt.isBranch = true;
                                    opt.reveals = revealed;
                                }
                            });
                        }
                    });
                }

                // Show notification
                statusSaved.textContent = `• Branch +${revealed.length} questions`;

                // Force save with updated branch data
                if (autoSaveToggle.checked && formData) {
                    lastSavedPage = null; // Reset to force save
                }

                // Request re-analysis to update UI (which will trigger auto-save)
                setTimeout(() => {
                    window.__msfa_commands.push({ type: 'analyze', time: Date.now() });
                }, 500);
            }
        }, 800); // Wait for MS Forms to update DOM
    }, true);

    // Expose branch data for saving
    window.__msfa_getBranchData = () => branchData;

    console.log('[MSFA] Record Mode UI ready');
})();
