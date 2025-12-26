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
            .btn-danger { background: #ef4444; color: white; }
            .btn-danger:hover { background: #dc2626; }
            
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

            /* Info Bar & Status Bar (Restored) */
            .info-bar {
                padding: 10px 16px;
                background: #f8fafc;
                border-top: 1px solid #e2e8f0;
                font-size: 12px; flex-shrink: 0;
            }
            .info-row {
                display: flex; align-items: center;
                gap: 8px; flex-wrap: wrap;
            }
            .info-label { color: #64748b; font-weight: 600; margin-right: 4px; }
            
            .badge {
                display: inline-flex; align-items: center; gap: 4px;
                padding: 2px 8px; border-radius: 4px;
                font-size: 11px; font-weight: 600;
            }
            .badge.primary { background: #667eea; color: white; }
            .badge.success { background: #22c55e; color: white; }
            .badge svg { width: 10px; height: 10px; }

            .status-bar {
                padding: 6px 16px;
                background: #fff;
                border-top: 1px solid #e2e8f0;
                display: flex; align-items: center; justify-content: space-between;
                flex-shrink: 0; min-height: 28px;
            }
            .status-text { font-size: 11px; color: #64748b; }
            .status-saved { font-size: 11px; color: #22c55e; font-weight: 600; display: flex; align-items: center; gap: 4px; }
            
            /* View All Button */
            .view-all-btn {
                margin-left: auto;
                width: 28px; height: 28px;
                background: transparent; border: none;
                border-radius: 4px; cursor: pointer;
                display: flex; align-items: center; justify-content: center;
            }
            .view-all-btn:hover { background: #e2e8f0; }
            .view-all-btn svg { width: 16px; height: 16px; color: #64748b; }
            
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
            .page-section { margin-bottom: 20px; }
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

                <div class="info-bar hidden" id="infoBar">
                    <div class="info-row">
                        <span class="info-label">Página:</span>
                        <span class="badge primary" id="pageBadge">1/?</span>
                        
                        <div style="flex:1"></div>
                        
                        <span class="info-label">Acciones:</span>
                        <span class="badge success" id="nextBadge" style="display:none">${ICONS.check} Next</span>
                        <span class="badge success" id="backBadge" style="display:none">${ICONS.check} Back</span>
                        <span class="badge success" id="submitBadge" style="display:none">${ICONS.check} Submit</span>
                    </div>
                </div>

                <div class="status-bar hidden" id="statusBar">
                    <span class="status-text" id="statusText">Ready</span>
                    <span class="status-saved" id="statusSaved"></span>
                    <button class="view-all-btn" id="viewAllBtn" title="Ver todo lo grabado">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                    </button>
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
                    <button class="btn btn-danger" id="stopBtn">${ICONS.stop} Detener</button>
                </div>
            </div>
        </div>
        
        <div class="modal-overlay" id="modalOverlay">
            <div class="modal" id="modal">
                <div class="modal-header" id="modalHeader">
                    <span class="modal-title">Todo lo Grabado</span>
                    <button class="modal-close" id="modalClose">${ICONS.close}</button>
                </div>
                <div class="modal-content" id="modalContent">
                    <p style="color:#64748b; text-align:center; padding:20px;">Aún no hay datos. Navega por las páginas y guarda para ver las preguntas aquí.</p>
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

    // New UI Elements (Restored)
    const infoBar = shadow.getElementById('infoBar');
    const statusBar = shadow.getElementById('statusBar');
    const pageBadge = shadow.getElementById('pageBadge');
    const nextBadge = shadow.getElementById('nextBadge');
    const backBadge = shadow.getElementById('backBadge');
    const submitBadge = shadow.getElementById('submitBadge');
    const statusText = shadow.getElementById('statusText');
    const statusSaved = shadow.getElementById('statusSaved');
    const viewAllBtn = shadow.getElementById('viewAllBtn');

    // Modal elements
    const modalOverlay = shadow.getElementById('modalOverlay');
    const modalContent = shadow.getElementById('modalContent');
    const modalClose = shadow.getElementById('modalClose');
    const modalHeader = shadow.getElementById('modalHeader');
    const modal = shadow.getElementById('modal');

    // Buttons
    const analyzeBtn = shadow.getElementById('analyzeBtn');
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
    let branchData = {};
    let allSavedPages = {}; // Storage for all saved pages { page_1: { questions: [...] }, page_2: {...} }

    // ============================================================
    // ROBUST PAGE DETECTION SYSTEM
    // ============================================================

    const SESSION_ID = crypto.randomUUID();
    const STORAGE_KEY = `__msfa_recording_${SESSION_ID}`;

    const recordingState = {
        sessionId: SESSION_ID,
        logicalPageCounter: 1,
        currentPageFingerprint: null,
        currentPageNumber: null,
        fingerprintToPage: {},
        isNavigating: false,
        navigationSource: null,
        domProvidesPageNumber: null,
        lastProgressText: null,
    };

    // Simple hash function for fingerprinting
    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    // Generate fingerprint from questions (for page identification)
    function generatePageFingerprint(questions) {
        if (!questions || questions.length === 0) return 'empty';
        const signature = questions
            .sort((a, b) => parseInt(a.num || '0') - parseInt(b.num || '0'))
            .map(q => q.questionId || q.num || q.text?.substring(0, 20) || '')
            .join('|');
        return hashCode(signature);
    }

    // Persist state to sessionStorage
    function saveStateToStorage() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                state: recordingState,
                pages: allSavedPages
            }));
        } catch (e) {
            console.warn('[MSFA] Failed to save to sessionStorage:', e);
        }
    }

    // Load state from sessionStorage
    function loadStateFromStorage() {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                Object.assign(recordingState, data.state);
                allSavedPages = data.pages || {};
                console.log('[MSFA] Restored state from sessionStorage, pages:', Object.keys(allSavedPages).length);
            }
        } catch (e) {
            console.warn('[MSFA] Failed to load from sessionStorage:', e);
        }
    }

    // Determine page number using hybrid logic
    function determinePageNumber(data) {
        // Case 1: DOM provides page number
        const match = data.pageInfo?.text?.match(/(\d+)\s*(?:de|of)\s*(\d+)/i);
        if (match) {
            recordingState.domProvidesPageNumber = true;
            const pageNum = parseInt(match[1]);

            // Also register fingerprint for this page (for future reference)
            const fp = generatePageFingerprint(data.questions);
            if (!recordingState.fingerprintToPage[fp]) {
                recordingState.fingerprintToPage[fp] = pageNum;
            }

            // Update current page number and fingerprint
            recordingState.currentPageNumber = pageNum;
            recordingState.currentPageFingerprint = fp;

            return pageNum;
        }

        recordingState.domProvidesPageNumber = false;

        // Generate fingerprint for this page
        const fp = generatePageFingerprint(data.questions);

        // Case 2: First analysis (no current page yet) OR Navigation event
        // Treat first analysis same as navigation to properly save page 1
        const isFirstAnalysis = recordingState.currentPageNumber === null;

        if (recordingState.isNavigating || isFirstAnalysis) {
            if (recordingState.fingerprintToPage[fp]) {
                // Page already visited - return existing number
                console.log('[MSFA] Page revisited, fingerprint:', fp);
                return recordingState.fingerprintToPage[fp];
            } else {
                // New page - assign new number
                const newPageNum = recordingState.logicalPageCounter++;
                recordingState.fingerprintToPage[fp] = newPageNum;
                console.log('[MSFA] New page detected, assigned number:', newPageNum, 'fingerprint:', fp, isFirstAnalysis ? '(first analysis)' : '');
                return newPageNum;
            }
        }

        // Case 3: Not a navigation event (branch reveal) - use current page
        return recordingState.currentPageNumber || 1;
    }

    // Show error in UI (visible, not silent)
    function showTimeoutError(message) {
        console.error('[MSFA] Timeout Error:', message);
        statusText.textContent = '⚠️ ' + message;
        statusSaved.innerHTML = `<span style="color:#ef4444">Error</span>`;
        loading.classList.add('hidden');
        questionList.classList.remove('hidden');
    }

    // MutationObserver-based DOM stability detection
    let domObserver = null;
    let domStabilityTimer = null;
    let maxTimeoutTimer = null;
    let mutationsSinceNavigation = 0;

    function setupDOMObserver() {
        if (domObserver) return; // Already set up

        domObserver = new MutationObserver((mutations) => {
            // Only process if navigation is in progress
            if (!recordingState.isNavigating) return;

            // Check for relevant changes
            const hasRelevantChanges = mutations.some(m => {
                return m.addedNodes.length > 0 ||
                    m.removedNodes.length > 0 ||
                    (m.target.matches && m.target.matches('[data-automation-id]'));
            });

            if (hasRelevantChanges) {
                mutationsSinceNavigation++;

                // Reset debounce timer
                clearTimeout(domStabilityTimer);
                domStabilityTimer = setTimeout(() => {
                    // DOM stable for 300ms
                    if (mutationsSinceNavigation > 0 && recordingState.isNavigating) {
                        handleDOMStable();
                    }
                }, 300);
            }
        });

        domObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
        });

        console.log('[MSFA] DOM Observer initialized');
    }

    function handleDOMStable() {
        if (!recordingState.isNavigating) return;

        // Clear max timeout since we're handling it now
        clearTimeout(maxTimeoutTimer);
        mutationsSinceNavigation = 0;

        console.log('[MSFA] DOM stable, requesting analysis...');
        statusText.textContent = 'Analyzing...';

        // Request analysis from backend
        window.__msfa_commands.push({
            type: 'analyze',
            time: Date.now(),
            context: 'navigation',
            source: recordingState.navigationSource
        });
    }

    function startNavigationDetection(source) {
        recordingState.isNavigating = true;
        recordingState.navigationSource = source;
        mutationsSinceNavigation = 0;

        // Show loading state
        loading.classList.remove('hidden');
        questionList.classList.add('hidden');
        statusText.textContent = 'Page changing...';
        statusSaved.textContent = '';

        // Set maximum timeout (safety net) - 15 seconds
        clearTimeout(maxTimeoutTimer);
        maxTimeoutTimer = setTimeout(() => {
            if (recordingState.isNavigating) {
                // Timeout exceeded - show visible error
                showTimeoutError('Timeout: Page transition took too long (15s). Try clicking Analyze manually.');
                recordingState.isNavigating = false;
            }
        }, 15000);

        console.log('[MSFA] Navigation started:', source);
    }

    // Initialize on load
    loadStateFromStorage();
    setupDOMObserver();
    console.log('[MSFA] Page detection system initialized, sessionId:', SESSION_ID);

    // Auto-save function (Uses robust page detection)
    function triggerAutoSave() {
        if (!formData) return;

        console.log('[MSFA] triggerAutoSave called');

        // Determine page number using hybrid logic
        const pageNumber = determinePageNumber(formData);

        // If this was a navigation, freeze the fingerprint
        if (recordingState.isNavigating) {
            recordingState.currentPageFingerprint = generatePageFingerprint(formData.questions);
            recordingState.currentPageNumber = pageNumber;
            recordingState.isNavigating = false;
            clearTimeout(maxTimeoutTimer);
            console.log('[MSFA] Navigation complete, page:', pageNumber, 'fingerprint:', recordingState.currentPageFingerprint);
        }

        // Build page key
        const pageKey = formData.isPostSubmitPage ? 'page_postSubmit' : `page_${pageNumber}`;

        // Merge with existing data if present (preserve branches)
        const existingPage = allSavedPages[pageKey];
        if (existingPage && existingPage.questions) {
            // Merge questions - add new ones, update existing
            const mergedQuestions = { ...existingPage.questions };
            formData.questions.forEach(q => {
                const qKey = `q${q.num}`;
                mergedQuestions[qKey] = q;
            });

            allSavedPages[pageKey] = {
                questions: formData.questions, // Keep array format for display
                questionsMap: mergedQuestions, // Keep map format for lookups
                pageInfo: { ...formData.pageInfo, current: pageNumber },
                isPostSubmitPage: formData.isPostSubmitPage || false,
                postSubmitActions: formData.postSubmitActions || {}
            };
        } else {
            allSavedPages[pageKey] = {
                questions: formData.questions,
                pageInfo: { ...formData.pageInfo, current: pageNumber },
                isPostSubmitPage: formData.isPostSubmitPage || false,
                postSubmitActions: formData.postSubmitActions || {}
            };
        }

        console.log('[MSFA] Saved to allSavedPages:', pageKey, 'Total pages:', Object.keys(allSavedPages).length);

        // Persist to sessionStorage
        saveStateToStorage();

        // Only send save command to backend when page changes
        const currentPageKey = formData.isPostSubmitPage ? 'postSubmit' : pageNumber;
        if (currentPageKey !== lastSavedPage) {
            lastSavedPage = currentPageKey;
            statusSaved.innerHTML = `${ICONS.spinner} Saving...`;

            // Update formData.pageInfo.current with determined page number
            const dataToSave = { ...formData };
            if (dataToSave.pageInfo) {
                dataToSave.pageInfo = { ...dataToSave.pageInfo, current: pageNumber };
            }

            window.__msfa_commands.push({ type: 'save', data: dataToSave, time: Date.now() });

            // Update saved indicator
            setTimeout(() => {
                statusSaved.innerHTML = `${ICONS.check} Saved`;
            }, 800);
        }
    }

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
            // Put page_postSubmit at the end
            if (a === 'page_postSubmit') return 1;
            if (b === 'page_postSubmit') return -1;
            const numA = parseInt(a.replace('page_', ''));
            const numB = parseInt(b.replace('page_', ''));
            return numA - numB;
        });

        if (pages.length === 0) {
            modalContent.innerHTML = '<p style="color:#64748b; text-align:center; padding:20px;">Aún no hay datos. Navega por las páginas para ver las preguntas aquí.</p>';
            return;
        }

        const totalPages = formData?.pageInfo?.total || pages.length;

        let html = '';
        pages.forEach(pageKey => {
            const pageData = allSavedPages[pageKey];
            const isPostSubmit = pageData.isPostSubmitPage || pageKey === 'page_postSubmit';

            // Header: show "Post-Submit" for post-submit page
            const headerText = isPostSubmit
                ? 'Post-Submit'
                : `Página ${pageKey.replace('page_', '')} de ${totalPages}`;

            html += `<div class="page-section">
                <div class="page-header">${headerText}</div>`;

            // Render questions (if any)
            if (pageData.questions && pageData.questions.length > 0) {
                pageData.questions.forEach(q => {
                    let optionsHtml = '';
                    if (q.options && q.options.length > 0) {
                        optionsHtml = '<div class="page-options">' +
                            q.options.map((o, i) => `<span class="page-option">${i + 1}. ${o.text || o.value}</span>`).join('') +
                            '</div>';
                    }

                    html += `<div class="page-question">
                        <span class="page-question-num">${q.num}</span>
                        ${q.text || 'Sin título'}
                        <span class="page-question-type">${q.type || ''}</span>
                        ${optionsHtml}
                    </div>`;
                });
            }

            // Render post-submit actions as click items
            if (isPostSubmit && pageData.postSubmitActions) {
                const actions = pageData.postSubmitActions;
                if (actions.saveAndEdit) {
                    html += `<div class="page-question" style="background:#dcfce7; border-left:3px solid #16a34a;">
                        <span class="page-question-num">•</span>
                        ${actions.saveAndEdit.text || 'Guardar mi respuesta'}
                        <span class="page-question-type">CLICK</span>
                    </div>`;
                }
                if (actions.submitAnother) {
                    html += `<div class="page-question" style="background:#dcfce7; border-left:3px solid #16a34a;">
                        <span class="page-question-num">•</span>
                        ${actions.submitAnother.text || 'Enviar otra respuesta'}
                        <span class="page-question-type">CLICK</span>
                    </div>`;
                }
            }

            html += '</div>';
        });

        modalContent.innerHTML = html;
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
        statusText.textContent = 'Analizando formulario...';
        window.__msfa_commands.push({ type: 'analyze', time: Date.now() });
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
        // Merge branch data into incoming data before storing
        if (typeof branchData !== 'undefined' && Object.keys(branchData).length > 0) {
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
        hasAnalyzed = true;

        // Update Analyze Button Text
        analyzeBtn.innerHTML = `${ICONS.analyze} Re-Analyze`;

        loading.classList.add('hidden');
        questionList.classList.remove('hidden');
        footer.classList.remove('hidden');

        // Update Info Bar (Restored)
        infoBar.classList.remove('hidden');
        statusBar.classList.remove('hidden');

        pageBadge.textContent = `${data.pageInfo.current}/${data.pageInfo.total}`;
        nextBadge.style.display = data.hasNext ? 'inline-flex' : 'none';
        backBadge.style.display = data.hasBack ? 'inline-flex' : 'none';
        submitBadge.style.display = data.hasSubmit ? 'inline-flex' : 'none';

        statusText.textContent = `Preguntas: ${data.questions.length}`;

        questionList.innerHTML = '';
        data.questions.forEach((q, idx) => {
            const li = document.createElement('li');
            li.className = 'question-item';

            let optionsHtml = '';
            // Render options and check for branches
            if (q.options && q.options.length > 0) {
                optionsHtml = '<div style="margin-top:6px; padding-left:10px; font-size:11px; color:#64748b;">' +
                    q.options.map((o, oi) => {
                        const isBranch = o.isBranch || false;
                        const reveals = o.reveals || [];
                        const branchBadge = isBranch
                            ? `<span style="display:inline-block;background:#f59e0b;color:white;font-size:9px;font-weight:600;padding:1px 5px;border-radius:3px;margin-left:6px;">BRANCH</span>`
                            : '';

                        // Only show if it's a branch or has content
                        return `<div style="margin-bottom:3px; display:flex; flex-direction:column; ${isBranch ? 'border-left:2px solid #f59e0b; padding-left:4px; background:rgba(245, 158, 11, 0.05);' : ''}">
                            <div style="display:flex; align-items:center">
                                • ${o.text || o.value} ${branchBadge}
                            </div>
                            ${reveals.length > 0 ? `<div style="font-size:10px;color:#d97706;margin-left:8px;">↳ Revela ${reveals.length} preguntas</div>` : ''}
                        </div>`;
                    }).join('') +
                    '</div>';
            }

            li.innerHTML = `
                <div style="display:flex; align-items:center">
                    <span class="question-num">${q.num}</span>
                    <div style="flex:1">
                        <span class="question-text">${q.text || 'Untitled'}</span>
                        ${optionsHtml}
                    </div>
                </div>
            `;
            questionList.appendChild(li);
        });

        // Handle post-submit page (after form submission)
        if (data.isPostSubmitPage && data.postSubmitActions) {
            const postSubmitContainer = document.createElement('div');
            postSubmitContainer.className = 'post-submit-container';
            postSubmitContainer.style.cssText = 'margin-top:12px; padding:10px; background:linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%); border-radius:8px; border:1px solid #86efac;';

            let actionsHtml = '<div style="font-size:12px; font-weight:600; color:#166534; margin-bottom:8px;">Formulario Enviado</div>';
            actionsHtml += '<div style="font-size:11px; color:#15803d; margin-bottom:8px;">Acciones disponibles:</div>';

            if (data.postSubmitActions.saveAndEdit) {
                actionsHtml += `
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; padding:6px; background:white; border-radius:4px; border:1px solid #bbf7d0;">
                        <span style="color:#16a34a;">•</span>
                        <span style="font-size:11px; color:#15803d;">${data.postSubmitActions.saveAndEdit.text}</span>
                    </div>
                `;
            }

            if (data.postSubmitActions.submitAnother) {
                actionsHtml += `
                    <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; padding:6px; background:white; border-radius:4px; border:1px solid #bbf7d0;">
                        <span style="color:#16a34a;">•</span>
                        <span style="font-size:11px; color:#15803d;">${data.postSubmitActions.submitAnother.text}</span>
                    </div>
                `;
            }

            postSubmitContainer.innerHTML = actionsHtml;
            questionList.appendChild(postSubmitContainer);

            statusText.textContent = 'Enviado - Post-submit detectado';
        }

        // Trigger auto-save to memory
        triggerAutoSave();
    };

    window.__msfa_setQuestions = window.__msfa_setFormData;

    // Auto-analyze when Next/Back buttons are clicked (using MutationObserver)
    document.addEventListener('click', (e) => {
        const nextBtn = e.target.closest('[data-automation-id="nextButton"]');
        const backBtn = e.target.closest('[data-automation-id="backButton"]');

        if (nextBtn) {
            startNavigationDetection('next');
            return;
        }

        if (backBtn) {
            startNavigationDetection('back');
            return;
        }
    }, true);

    // Auto-analyze when Submit button is clicked (using MutationObserver)
    document.addEventListener('click', (e) => {
        const submitBtn = e.target.closest('[data-automation-id="submitButton"]');
        if (!submitBtn) return;

        startNavigationDetection('submit');
        statusText.textContent = 'Enviando formulario...';
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
                // The autoSaveToggle was removed, so this condition needs to be adjusted or removed.
                // Assuming we always want to save if formData exists and branch data changed.
                if (formData) {
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
