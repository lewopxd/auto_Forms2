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
                min-height: 48px;
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
            
            .auto-save-toggle {
                display: flex; align-items: center; gap: 6px;
                margin-right: 8px; cursor: pointer;
            }
            .auto-save-toggle input { display: none; }
            .toggle-slider {
                width: 32px; height: 18px;
                background: rgba(255,255,255,0.3);
                border-radius: 9px;
                position: relative;
                transition: 0.2s;
            }
            .toggle-slider::before {
                content: '';
                position: absolute;
                width: 14px; height: 14px;
                background: white;
                border-radius: 50%;
                top: 2px; left: 2px;
                transition: 0.2s;
            }
            .auto-save-toggle input:checked + .toggle-slider {
                background: #22c55e;
            }
            .auto-save-toggle input:checked + .toggle-slider::before {
                left: 16px;
            }
            .toggle-label {
                font-size: 11px; color: rgba(255,255,255,0.8);
                font-weight: 500;
            }
            
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
            .question-item.required { border-left: 4px solid #ef4444; }
            
            .question-header { display: flex; align-items: flex-start; }
            
            .question-num {
                width: 26px; height: 26px;
                background: #667eea; color: white;
                border-radius: 6px; display: flex;
                align-items: center; justify-content: center;
                font-size: 12px; font-weight: 600;
                margin-right: 10px; flex-shrink: 0;
            }
            
            .question-content { flex: 1; min-width: 0; }
            .question-text { font-size: 13px; color: #334155; word-break: break-word; font-weight: 500; }
            
            .question-meta {
                display: flex; align-items: center; gap: 8px;
                margin-top: 4px; font-size: 11px; color: #64748b;
            }
            .question-type {
                background: #e2e8f0; padding: 2px 8px;
                border-radius: 4px; color: #475569;
            }
            .required-dot { color: #ef4444; }
            .required-dot svg { width: 10px; height: 10px; }
            
            .expand-btn {
                width: 24px; height: 24px;
                background: #e2e8f0; border: none; border-radius: 4px;
                cursor: pointer; display: flex; align-items: center;
                justify-content: center; flex-shrink: 0;
                transition: transform 0.2s;
            }
            .expand-btn:hover { background: #cbd5e1; }
            .expand-btn svg { width: 12px; height: 12px; color: #475569; }
            .expand-btn.expanded { transform: rotate(90deg); }
            
            .question-details {
                display: none;
                margin-top: 10px; padding: 10px;
                background: #1e293b; border-radius: 6px;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 11px; color: #94a3b8;
            }
            .question-details.visible { display: block; }
            .question-details code {
                color: #22c55e; display: block;
                margin: 3px 0; word-break: break-all;
            }
            .question-details .label { color: #64748b; }
            
            .options-list {
                margin-top: 8px; padding-left: 36px;
                font-size: 12px; color: #475569;
            }
            .option-item {
                padding: 6px 8px; margin: 4px 0;
                background: white; border: 1px solid #e2e8f0;
                border-radius: 4px;
            }
            .option-item.is-branch {
                border-left: 3px solid #f59e0b;
                background: #fffbeb;
            }
            .option-item .branch-badge {
                display: inline-block;
                background: #f59e0b; color: white;
                font-size: 9px; font-weight: 600;
                padding: 1px 5px; border-radius: 3px;
                margin-left: 6px;
            }
            .option-item .branch-reveals {
                font-size: 10px; color: #92400e;
                margin-top: 4px;
            }
            
            .info-bar {
                padding: 12px 16px;
                background: #f8fafc;
                border-top: 1px solid #e2e8f0;
                font-size: 13px; flex-shrink: 0;
            }
            
            .info-row {
                display: flex; align-items: center;
                gap: 10px; flex-wrap: wrap;
            }
            
            .info-label { color: #64748b; font-weight: 500; }
            
            .badge {
                display: inline-flex; align-items: center; gap: 4px;
                padding: 3px 8px; border-radius: 5px;
                font-size: 12px; font-weight: 600;
            }
            .badge.primary { background: #667eea; color: white; }
            .badge.success { background: #22c55e; color: white; }
            .badge svg { width: 12px; height: 12px; }
            
            .status-bar {
                padding: 10px 16px;
                background: #f8fafc;
                border-top: 1px solid #e2e8f0;
                display: flex; align-items: center;
                gap: 8px; flex-shrink: 0;
            }
            .status-text { font-size: 12px; color: #475569; font-weight: 500; }
            .status-saved { font-size: 11px; color: #22c55e; }
            .view-all-btn {
                margin-left: auto;
                width: 28px; height: 28px;
                background: transparent; border: none;
                border-radius: 4px; cursor: pointer;
                display: flex; align-items: center; justify-content: center;
            }
            .view-all-btn:hover { background: #e2e8f0; }
            .view-all-btn svg { width: 16px; height: 16px; color: #64748b; }
            
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
            
            /* View All Modal */
            .modal-overlay {
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.3);
                display: none; align-items: center; justify-content: center;
                z-index: 2147483646;
            }
            .modal-overlay.visible { display: flex; }
            .modal {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.25);
                width: 500px; max-width: 90vw;
                max-height: 80vh;
                display: flex; flex-direction: column;
                overflow: hidden;
            }
            .modal-header {
                padding: 14px 18px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex; align-items: center;
                cursor: move;
            }
            .modal-title { flex: 1; font-size: 14px; font-weight: 600; color: white; }
            .modal-close {
                width: 24px; height: 24px; border: none;
                background: rgba(255,255,255,0.2); border-radius: 4px;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
            }
            .modal-close:hover { background: rgba(255,255,255,0.3); }
            .modal-close svg { width: 12px; height: 12px; color: white; }
            .modal-content {
                flex: 1; overflow-y: auto; padding: 16px;
            }
            .page-section {
                margin-bottom: 20px;
            }
            .page-header {
                font-size: 12px; font-weight: 600;
                color: #667eea; margin-bottom: 10px;
                padding-bottom: 6px;
                border-bottom: 2px solid #e2e8f0;
            }
            .page-question {
                padding: 8px 10px;
                background: #f8fafc;
                border-radius: 6px;
                margin-bottom: 6px;
                font-size: 12px;
            }
            .page-question-num {
                display: inline-block;
                width: 20px; height: 20px;
                background: #667eea; color: white;
                border-radius: 4px; text-align: center;
                line-height: 20px; font-size: 10px;
                margin-right: 8px;
            }
            .page-question-type {
                float: right;
                font-size: 10px; color: #94a3b8;
            }
            .page-options {
                margin-top: 6px; padding-left: 28px;
                display: flex; flex-wrap: wrap; gap: 4px;
            }
            .page-option {
                background: #e2e8f0;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                color: #475569;
            }
            .hidden { display: none !important; }
        </style>
        
        <div class="panel" id="panel">
            <div class="header" id="header">
                <span class="header-icon">${ICONS.record}</span>
                <span class="header-title">Record Mode</span>
                <label class="auto-save-toggle" title="Auto-save on changes">
                    <input type="checkbox" id="autoSaveToggle" checked>
                    <span class="toggle-slider"></span>
                    <span class="toggle-label">Auto Save</span>
                </label>
                <button class="header-btn" id="collapseBtn" title="Collapse">${ICONS.collapse}</button>
                <button class="header-btn" id="closeBtn" title="Close">${ICONS.close}</button>
            </div>
            
            <div class="body" id="body">
                <div class="content" id="content">
                    <div class="loading" id="loading">
                        ${ICONS.spinner}
                        <span class="loading-text">Analyzing form...</span>
                    </div>
                    <ul class="question-list hidden" id="questionList"></ul>
                </div>
                
                <div class="info-bar hidden" id="infoBar">
                    <div class="info-row">
                        <span class="info-label">Page:</span>
                        <span class="badge primary" id="pageBadge">1/1</span>
                        <span class="info-label">Found:</span>
                        <span class="badge success" id="nextBadge" style="display:none">${ICONS.check} Next</span>
                        <span class="badge success" id="backBadge" style="display:none">${ICONS.check} Back</span>
                        <span class="badge success" id="submitBadge" style="display:none">${ICONS.check} Submit</span>
                    </div>
                </div>
                
                <div class="status-bar hidden" id="statusBar">
                    <span class="status-text" id="statusText">0 questions</span>
                    <span class="status-saved" id="statusSaved"></span>
                    <button class="view-all-btn" id="viewAllBtn" title="View all saved questions">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                    </button>
                </div>
                
                <div class="footer hidden" id="footer">
                    <button class="btn btn-primary" id="analyzeBtn">${ICONS.analyze} Analyze</button>
                    <button class="btn btn-success" id="saveBtn">${ICONS.save} Save</button>
                </div>
            </div>
        </div>
        
        <div class="modal-overlay" id="modalOverlay">
            <div class="modal" id="modal">
                <div class="modal-header" id="modalHeader">
                    <span class="modal-title">All Saved Questions</span>
                    <button class="modal-close" id="modalClose">${ICONS.close}</button>
                </div>
                <div class="modal-content" id="modalContent">
                    <p style="color:#64748b; text-align:center; padding:20px;">No saved data yet. Navigate through pages and save to see questions here.</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(host);

    const panel = shadow.getElementById('panel');
    const header = shadow.getElementById('header');
    const body = shadow.getElementById('body');
    const collapseBtn = shadow.getElementById('collapseBtn');
    const infoBar = shadow.getElementById('infoBar');
    const pageBadge = shadow.getElementById('pageBadge');
    const nextBadge = shadow.getElementById('nextBadge');
    const backBadge = shadow.getElementById('backBadge');
    const submitBadge = shadow.getElementById('submitBadge');
    const loading = shadow.getElementById('loading');
    const questionList = shadow.getElementById('questionList');
    const footer = shadow.getElementById('footer');
    const statusBar = shadow.getElementById('statusBar');
    const statusText = shadow.getElementById('statusText');
    const statusSaved = shadow.getElementById('statusSaved');
    const viewAllBtn = shadow.getElementById('viewAllBtn');
    const analyzeBtn = shadow.getElementById('analyzeBtn');
    const saveBtn = shadow.getElementById('saveBtn');
    const autoSaveToggle = shadow.getElementById('autoSaveToggle');
    const modalOverlay = shadow.getElementById('modalOverlay');
    const modal = shadow.getElementById('modal');
    const modalHeader = shadow.getElementById('modalHeader');
    const modalContent = shadow.getElementById('modalContent');
    const modalClose = shadow.getElementById('modalClose');

    // Storage for all saved pages
    let allSavedPages = {}; // { page_1: { questions: [...] }, page_2: {...} }

    let formData = null;
    let branchData = {}; // { questionId: { optionValue: [revealedQuestionIds] } }
    let lastSavedPage = null;

    // Auto-save function
    function triggerAutoSave() {
        if (!autoSaveToggle.checked || !formData) return;

        const currentPage = formData.pageInfo?.current;
        // Avoid saving the same page multiple times in quick succession
        if (currentPage !== lastSavedPage) {
            lastSavedPage = currentPage;
            statusSaved.textContent = '• Saving...';
            window.__msfa_commands.push({ type: 'save', data: formData, time: Date.now() });
        }
    }

    shadow.getElementById('closeBtn').onclick = () => host.remove();

    let collapsed = false;
    collapseBtn.onclick = () => {
        collapsed = !collapsed;
        body.classList.toggle('hidden', collapsed);
        panel.classList.toggle('collapsed', collapsed);
        collapseBtn.innerHTML = collapsed ? ICONS.expand : ICONS.collapse;
    };

    // Drag
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

    // Analyze button - queue command for Python
    analyzeBtn.onclick = () => {
        loading.classList.remove('hidden');
        questionList.classList.add('hidden');
        statusText.textContent = 'Analyzing...';
        statusSaved.textContent = '';
        window.__msfa_commands.push({ type: 'analyze', time: Date.now() });
    };

    // Save button - queue command with data
    saveBtn.onclick = () => {
        if (formData) {
            statusText.textContent = 'Saving...';
            window.__msfa_commands.push({ type: 'save', data: formData, time: Date.now() });
        }
    };

    window.__msfa_onSaved = function () {
        // Store saved page data
        if (formData && formData.pageInfo) {
            const pageKey = 'page_' + formData.pageInfo.current;
            allSavedPages[pageKey] = {
                questions: formData.questions,
                pageInfo: formData.pageInfo
            };
        }

        // Show persistent saved indicator
        if (formData) {
            statusText.textContent = formData.questions.length + ' questions';
            statusSaved.textContent = '• Page saved';
        } else {
            statusSaved.textContent = '• Saved';
        }
    };

    // View All Button - Open Modal
    viewAllBtn.onclick = () => {
        renderModal();
        modalOverlay.classList.add('visible');
    };

    // Modal Close
    modalClose.onclick = () => modalOverlay.classList.remove('visible');
    modalOverlay.onclick = (e) => {
        if (e.target === modalOverlay) modalOverlay.classList.remove('visible');
    };

    // Modal Drag
    let modalDragging = false, mox = 0, moy = 0;
    modalHeader.onmousedown = (e) => {
        if (e.target.closest('.modal-close')) return;
        modalDragging = true;
        const rect = modal.getBoundingClientRect();
        mox = e.clientX - rect.left;
        moy = e.clientY - rect.top;
        e.preventDefault();
    };
    document.addEventListener('mousemove', (e) => {
        if (!modalDragging) return;
        modal.style.position = 'fixed';
        modal.style.left = (e.clientX - mox) + 'px';
        modal.style.top = (e.clientY - moy) + 'px';
        modal.style.margin = '0';
    });
    document.addEventListener('mouseup', () => modalDragging = false);

    // Render Modal Content
    function renderModal() {
        const pages = Object.keys(allSavedPages).sort((a, b) => {
            const numA = parseInt(a.replace('page_', ''));
            const numB = parseInt(b.replace('page_', ''));
            return numA - numB;
        });

        if (pages.length === 0) {
            modalContent.innerHTML = '<p style="color:#64748b; text-align:center; padding:20px;">No saved data yet. Navigate through pages and save to see questions here.</p>';
            return;
        }

        const totalPages = formData?.pageInfo?.total || pages.length;

        let html = '';
        pages.forEach(pageKey => {
            const pageData = allSavedPages[pageKey];
            const pageNum = pageKey.replace('page_', '');

            html += `<div class="page-section">
                <div class="page-header">Page ${pageNum} of ${totalPages}</div>`;

            pageData.questions.forEach(q => {
                let optionsHtml = '';
                if (q.options && q.options.length > 0) {
                    optionsHtml = '<div class="page-options">' +
                        q.options.map((o, i) => `<span class="page-option">${i + 1}. ${o.text}</span>`).join('') +
                        '</div>';
                }

                html += `<div class="page-question">
                    <span class="page-question-num">${q.num}</span>
                    ${q.text || 'Untitled'}
                    <span class="page-question-type">${q.type}</span>
                    ${optionsHtml}
                </div>`;
            });

            html += '</div>';
        });

        modalContent.innerHTML = html;
    }

    // API
    window.__msfa_setFormData = function (data) {
        // Merge branch data into incoming data
        if (typeof branchData !== 'undefined') {
            data.questions.forEach(q => {
                if (q.questionId && branchData[q.questionId] && q.options) {
                    q.options.forEach(opt => {
                        const optValue = opt.text || opt.value;
                        if (branchData[q.questionId][optValue]) {
                            opt.isBranch = true;
                            opt.reveals = branchData[q.questionId][optValue];
                        }
                    });
                }
            });
        }

        formData = data;
        loading.classList.add('hidden');
        questionList.classList.remove('hidden');
        infoBar.classList.remove('hidden');
        footer.classList.remove('hidden');

        pageBadge.textContent = data.pageInfo.current + '/' + data.pageInfo.total;

        nextBadge.style.display = data.hasNext ? 'inline-flex' : 'none';
        backBadge.style.display = data.hasBack ? 'inline-flex' : 'none';
        submitBadge.style.display = data.hasSubmit ? 'inline-flex' : 'none';

        questionList.innerHTML = '';
        data.questions.forEach((q, idx) => {
            const li = document.createElement('li');
            li.className = 'question-item' + (q.required ? ' required' : '');

            let detailsHtml = '<div class="question-details" id="details-' + idx + '">';
            if (q.selenium) {
                detailsHtml += '<span class="label">Action:</span><code>' + q.selenium.action + '</code>';
                detailsHtml += '<span class="label">Selector:</span><code>' + (q.selenium.fullSelector || q.selenium.selector || 'N/A') + '</code>';
            }
            if (q.questionId) {
                detailsHtml += '<span class="label">Question ID:</span><code>' + q.questionId + '</code>';
            }
            detailsHtml += '</div>';

            let optionsHtml = '';
            if (q.options && q.options.length > 0) {
                optionsHtml = '<div class="options-list">' +
                    q.options.map((o, oi) => {
                        const isBranch = o.isBranch || false;
                        const reveals = o.reveals || [];
                        return `<div class="option-item${isBranch ? ' is-branch' : ''}">
                            <strong>${oi + 1}.</strong> ${o.text}
                            ${isBranch ? '<span class="branch-badge">BRANCH</span>' : ''}
                            ${reveals.length > 0 ? '<div class="branch-reveals">Reveals: ' + reveals.length + ' question(s)</div>' : ''}
                        </div>`;
                    }).join('') +
                    '</div>';
            }

            li.innerHTML = `
                <div class="question-header">
                    <span class="question-num">${q.num}</span>
                    <div class="question-content">
                        <div class="question-text">${q.text || 'Untitled'}</div>
                        <div class="question-meta">
                            <span class="question-type">${q.type}</span>
                            ${q.required ? '<span class="required-dot">' + ICONS.required + '</span>' : ''}
                        </div>
                    </div>
                    <button class="expand-btn" title="Show Selenium details">${ICONS.chevron}</button>
                </div>
                ${detailsHtml}
                ${optionsHtml}
            `;

            li.querySelector('.expand-btn').onclick = (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                const details = li.querySelector('.question-details');
                btn.classList.toggle('expanded');
                details.classList.toggle('visible');
            };

            questionList.appendChild(li);
        });


        statusBar.classList.remove('hidden');
        statusText.textContent = data.questions.length + ' questions';
        statusSaved.textContent = '';

        // Auto-save if enabled
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
