/**
 * AutoForm View Module - Phase 20 Fixes
 * Restore Action Icons (Fill/Select/Click)
 */
const AutoFormViewModule = (function () {
    'use strict';

    const tabs = new Map();

    /**
     * Renders the empty state for a tab
     * Shows "Grabando..." if recording is active, otherwise the default message
     */
    function renderEmptyState(tabId) {
        const tab = window.findTab ? window.findTab(tabId) : null;
        const isRecording = tab?.isRecording === true;
        const isLoadingRecording = tab?.isLoadingRecording === true;

        if (isRecording) {
            // Recording in progress - animated robot
            return `
                <div class="flex flex-col items-center justify-center py-16 text-center">
                    <i data-lucide="bot" class="w-16 h-16 text-orange-400 mb-4 af-bounce-bot"></i>
                    <p class="text-gray-500 mb-2">Grabando...</p>
                    <p class="text-xs text-gray-400">La grabación está en progreso</p>
                </div>
            `;
        } else if (isLoadingRecording) {
            // Recording stopped, loading the file - static robot
            return `
                <div class="flex flex-col items-center justify-center py-16 text-center">
                    <i data-lucide="bot" class="w-16 h-16 text-gray-300 mb-4"></i>
                    <p class="text-gray-500 mb-2">Cargando grabación...</p>
                    <p class="text-xs text-gray-400">Procesando el archivo grabado</p>
                </div>
            `;
        } else {
            // Default - no recording loaded
            return `
                <div class="flex flex-col items-center justify-center py-16 text-center">
                <i data-lucide="bot" class="w-16 h-16 text-gray-300 mb-4"></i>
                    <p class="text-gray-500 mb-2">Carga una grabación de formulario para comenzar</p>
                    <p class="text-xs text-gray-400">Usa el botón "Cargar" en la barra superior</p>
                </div>
            `;
        }
    }

    // ============================================================
    // 1. STRUCTURE GENERATION
    // ============================================================

    function createAutoFormContent(tabId, restored = null) {
        // Get tab data from project
        const tabData = window.findTab ? window.findTab(tabId) : null;
        const tabTitle = tabData?.title || 'AutoForm';

        // === MIGRATION: Convert old format (recordFile) to new format (recordings[]) ===
        if (tabData && tabData.recordFile && !tabData.recordings) {
            console.log('[AutoForm] Migrating from old format to recordings[]');
            const recId = 'rec-' + Date.now();
            tabData.recordings = [{
                id: recId,
                name: tabData.recordFile.name,
                path: tabData.recordFile.path,
                data: tabData.recordFile.data,
                cards: tabData.cards || []
            }];
            tabData.activeRecordingId = recId;
            delete tabData.recordFile;
            delete tabData.cards;
            if (window.triggerAutoSave) window.triggerAutoSave();
        }

        // Ensure recordings array exists
        if (tabData && !tabData.recordings) {
            tabData.recordings = [];
            tabData.activeRecordingId = null;
        }

        // Get active recording data
        let formData = null;
        let filePath = null;
        let fileName = null;

        if (tabData?.recordings?.length > 0 && tabData.activeRecordingId) {
            const activeRec = tabData.recordings.find(r => r.id === tabData.activeRecordingId);
            if (activeRec) {
                // Deep copy the data
                formData = JSON.parse(JSON.stringify(activeRec.data));
                filePath = activeRec.path;
                fileName = activeRec.name;

                // Apply saved responses from cards onto formData
                if (activeRec.cards && formData?.pages) {
                    activeRec.cards.forEach(card => {
                        const page = formData.pages[card.pageKey];
                        if (page?.questions?.[card.questionKey]) {
                            page.questions[card.questionKey].response = card.response;
                            page.questions[card.questionKey].selectedOptions = card.selectedOptions;
                        }
                    });
                }
            }
        }

        // Read saved mode BEFORE generating HTML to avoid flash
        const savedMode = tabData?.uiState?.mode || 'edit';
        const isViewMode = savedMode === 'view';

        tabs.set(tabId, {
            formData: formData,
            filePath: filePath,
            fileName: fileName,
            tabTitle: tabTitle
        });
        const state = tabs.get(tabId);

        const root = document.createElement('div');
        root.className = 'form-container';
        root.id = `af-root-${tabId}`;

        root.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
            position: relative;
            background: #f1f5f9; /* Phase 19 BG */
        `;

        root.innerHTML = `
            <!-- HEADER - Solo título de pestaña y toggle -->
            <div class="form-header p-3 border-b flex items-center justify-between bg-white flex-shrink-0">
                <div class="form-title-wrapper group flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer" 
                     title="Clic para editar" id="af-header-title-${tabId}">
                    <i data-lucide="bot" class="w-5 h-5 text-orange-600"></i>
                    <h3 class="form-title text-lg font-semibold text-gray-700" id="af-title-text-${tabId}">
                        ${escHtml(state.tabTitle)}
                    </h3>
                    <i data-lucide="edit-3" class="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                </div>
                
                <div class="flex items-center gap-2">
                    <!-- Toggle Group -->
                    <div class="af-toggle-group" id="af-toggle-group-${tabId}" style="display:${state.formData ? 'flex' : 'none'}">
                        <div class="af-toggle-item ${isViewMode ? '' : 'active-edit'}" id="af-tog-edit-${tabId}">
                            <i data-lucide="edit-3"></i> Editar
                        </div>
                        <div class="af-toggle-item ${isViewMode ? 'active-view' : ''}" id="af-tog-view-${tabId}">
                            <i data-lucide="eye"></i> Vista
                        </div>
                    </div>
                </div>
            </div>

            <!-- MAIN BODY -->
            <div class="form-body" style="flex: 1; position: relative; overflow: hidden; min-height: 0;">
                
                <!-- EDIT MODE VIEW -->
                <div class="edit-mode" id="af-edit-${tabId}" 
                     style="position:absolute; inset:0; display:${isViewMode ? 'none' : 'flex'}; flex-direction:column; overflow:hidden;">
                    <!-- INFO BAR: Only in Edit Mode -->
                    <div class="af-info-bar" id="af-info-bar-${tabId}"></div>
                    <div class="af-content-scroll" id="af-container-edit-${tabId}">
                        ${renderEmptyState(tabId)}
                    </div>
                </div>

                <!-- PREVIEW MODE VIEW -->
                <div class="view-mode" id="af-view-${tabId}" 
                     style="position:absolute; inset:0; display:${isViewMode ? 'flex' : 'none'}; flex-direction:column; overflow:hidden; background:#fafafa;">
                    <div class="af-view-scroll" id="af-container-view-${tabId}"></div>
                </div>

            </div>
        `;

        setTimeout(() => {
            setupToggleEvents(tabId, root);
            renderInfoBar(tabId); // Initial Render

            // Setup title editing
            const titleWrapper = root.querySelector(`#af-header-title-${tabId}`);
            const titleH3 = root.querySelector(`#af-title-text-${tabId}`);

            if (titleWrapper && titleH3) {
                titleWrapper.onclick = (e) => {
                    e.stopPropagation();
                    const currentData = window.findTab ? window.findTab(tabId) : null;
                    const currentTitle = currentData?.title || state.tabTitle;

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentTitle;
                    input.className = 'text-lg font-semibold text-gray-700 bg-white border border-orange-300 rounded px-2 py-1 outline-none min-w-[200px]';

                    const save = () => {
                        const newName = input.value.trim() || currentTitle;
                        titleH3.textContent = newName;
                        state.tabTitle = newName;

                        // Update tab span
                        const tabSpan = document.querySelector(`.chrome-tab[data-id="${tabId}"] span`);
                        if (tabSpan) tabSpan.textContent = newName;

                        // Update project data
                        if (window.updateTab) window.updateTab(tabId, { title: newName });

                        input.replaceWith(titleWrapper);
                    };

                    input.onblur = save;
                    input.onkeydown = (ev) => { if (ev.key === 'Enter') save(); };
                    titleWrapper.replaceWith(input);
                    input.focus();
                    input.select();
                };
            }

            if (state.formData) renderEdit(tabId);
            if (window.lucide) lucide.createIcons();
        }, 0);

        return root;
    }


    // ============================================================
    // 1.5 PERSISTENCE - Sync to projectData
    // ============================================================

    /**
     * Builds an array of cards from formData with current responses
     */
    function buildCardsArray(formData) {
        if (!formData?.pages) return [];

        const cards = [];
        const pages = formData.pages;

        Object.keys(pages).forEach(pageKey => {
            const page = pages[pageKey];
            const questions = page.questions || {};

            Object.keys(questions).forEach(qKey => {
                const q = questions[qKey];
                cards.push({
                    id: `card-${pageKey}-${qKey}`,
                    pageKey: pageKey,
                    questionKey: qKey,
                    response: q.response || '',
                    selectedOptions: q.selectedOptions || [],
                    config: {}  // Extensible for future
                });
            });
        });

        return cards;
    }

    /**
     * Gets the current mode (edit or view) for a tab
     */
    function getCurrentMode(tabId) {
        const editBtn = document.querySelector(`#af-tog-edit-${tabId}.active-edit`);
        return editBtn ? 'edit' : 'view';
    }

    /**
     * Syncs internal module state to window.projectData.tabs for autosave
     */
    function syncToProjectData(tabId) {
        const state = tabs.get(tabId);
        if (!state) return;

        const tab = window.findTab ? window.findTab(tabId) : null;
        if (!tab) return;

        // Ensure recordings array exists
        if (!tab.recordings) tab.recordings = [];

        // Find or create the active recording entry
        if (state.formData && tab.activeRecordingId) {
            const recIndex = tab.recordings.findIndex(r => r.id === tab.activeRecordingId);
            if (recIndex >= 0) {
                // Update existing recording's cards
                tab.recordings[recIndex].cards = buildCardsArray(state.formData);
                tab.recordings[recIndex].data = state.formData;
            }
        }

        // Sync UI state
        tab.uiState = {
            mode: getCurrentMode(tabId)
        };

        // Trigger autosave (debounced in app.js)
        if (window.triggerAutoSave) window.triggerAutoSave();
    }

    // ============================================================
    // 1.6 RECORDING MANAGER MODAL
    // ============================================================

    let currentManagerTabId = null;

    // ============================================================
    // 1.5 INFO BAR & RECORDING STATE
    // ============================================================

    function renderInfoBar(tabId) {
        const state = tabs.get(tabId);
        const tab = window.findTab ? window.findTab(tabId) : null;
        const container = document.getElementById(`af-info-bar-${tabId}`);
        if (!container) return;

        const isRecording = tab?.isRecording === true;
        const recInfo = tab?.recordingInfo || {};

        container.innerHTML = '';

        if (isRecording) {
            // === RECORDING MODE ===
            container.innerHTML = `
                <div class="af-info-record active">
                    <div class="flex items-center gap-2">
                        <div class="relative flex h-3 w-3">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                        </div>
                        <span class="font-bold text-orange-600 tracking-wide text-sm">REC</span>
                    </div>
                    
                    <span class="af-rec-name text-gray-800 font-medium ml-2">
                        ${escHtml(recInfo.filename || 'Grabando...')}
                    </span>

                    <button class="af-rec-btn stop" id="af-btn-stop-${tabId}" title="Detener Grabación">
                        <i data-lucide="square" class="fill-current"></i>
                        Detener
                    </button>
                </div>

                <div class="af-info-divider"></div>

                <div class="af-info-url flex" style="opacity: 0.8;">
                    <i data-lucide="${getBrowserIcon(recInfo.browser)}"></i>
                    <span class="text-xs text-gray-500 ml-1 truncate max-w-[200px]" title="${escHtml(recInfo.url)}">
                        ${escHtml(recInfo.url || 'Sin URL')}
                    </span>
                </div>
            `;

            // Attach Stop Handler
            const stopBtn = container.querySelector(`#af-btn-stop-${tabId}`);
            if (stopBtn) stopBtn.onclick = () => stopRecording(tabId);

        } else {
            // === STANDARD LOAD MODE ===
            const hasFile = !!state.formData;

            container.innerHTML = `
                <div class="af-info-record">
                    <i data-lucide="clapperboard"></i>
                    <span class="af-rec-name ${state.fileName ? '' : 'empty'}" id="af-raf-name-${tabId}">
                        ${state.fileName || 'Sin grabación'}
                    </span>
                    <button class="af-rec-btn" id="af-btn-open-${tabId}" title="Gestionar grabaciones">
                        <i data-lucide="folder-open"></i>
                        Cargar
                    </button>
                </div>
                
                <div class="af-info-divider" id="af-divider-${tabId}" style="display:${hasFile ? 'block' : 'none'}"></div>
                
                <div class="af-info-url" id="af-url-section-${tabId}" style="display:${hasFile ? 'flex' : 'none'}">
                    <i data-lucide="link"></i>
                    <input type="text" class="af-url-input" id="af-url-text-${tabId}" 
                           value="${escHtml(state.formData?.url || '')}" 
                           readonly title="${escHtml(state.formData?.url || '')}">
                    <button class="af-url-open" title="Abrir URL" onclick="AutoFormViewModule.openUrl('${tabId}')">
                        <i data-lucide="external-link"></i>
                    </button>
                </div>
            `;

            // Attach Open Handler
            const openBtn = container.querySelector(`#af-btn-open-${tabId}`);
            if (openBtn) openBtn.onclick = () => openRecordingManager(tabId);
        }

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Stop recording with confirmation dialog
     * @param {string} tabId - The tab ID
     * @param {boolean} skipConfirm - Whether to skip confirmation (e.g., browser closed externally)
     * @param {boolean} browserClosed - Whether browser was closed externally
     */
    async function stopRecording(tabId, skipConfirm = false, browserClosed = false) {
        const tab = window.findTab ? window.findTab(tabId) : null;
        if (!tab) return;

        if (browserClosed) {
            // Browser was closed externally - discard and show alert
            tab.isRecording = false;
            tab.isLoadingRecording = false;
            renderInfoBar(tabId);

            const contentContainer = document.getElementById(`af-container-edit-${tabId}`);
            if (contentContainer) {
                contentContainer.innerHTML = renderEmptyState(tabId);
                if (window.lucide) lucide.createIcons();
            }

            window.showAlert({
                icon: 'alert-triangle',
                iconColor: 'text-orange-500',
                title: 'Grabación Detenida',
                message: 'El navegador fue cerrado manualmente. La grabación se ha descartado.',
                confirmText: 'Entendido',
                confirmColor: 'bg-orange-600 hover:bg-orange-700'
            });
            return;
        }

        if (skipConfirm) {
            // Stop was triggered from injected UI with save preference
            await handleStopComplete(tabId, true);
            return;
        }

        // Show confirmation dialog
        window.showAlert({
            icon: 'square',
            iconColor: 'text-red-500',
            title: 'Detener Grabación',
            message: `
                <p class="mb-3">¿Estás seguro de que deseas detener la grabación?</p>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" id="stop-save-checkbox" checked class="accent-green-500">
                    <span>Guardar grabación antes de cerrar</span>
                </label>
            `,
            confirmText: 'Confirmar',
            cancelText: 'Cancelar',
            confirmColor: 'bg-red-600 hover:bg-red-700',
            onConfirm: async () => {
                const saveCheckbox = document.getElementById('stop-save-checkbox');
                const shouldSave = saveCheckbox?.checked ?? true;
                await handleStopComplete(tabId, shouldSave);
            }
        });
    }

    /**
     * Handle the completion of stopping a recording
     */
    async function handleStopComplete(tabId, shouldSave) {
        const tab = window.findTab ? window.findTab(tabId) : null;
        if (!tab) return;

        tab.isRecording = false;
        tab.isLoadingRecording = shouldSave;

        renderInfoBar(tabId);

        const contentContainer = document.getElementById(`af-container-edit-${tabId}`);
        if (contentContainer) {
            contentContainer.innerHTML = renderEmptyState(tabId);
            if (window.lucide) lucide.createIcons();
        }

        try {
            // Call backend to stop recording
            const result = await window.bridgePy.send('stop_recording', { save: shouldSave });
            console.log('[AutoForm] Stop recording result:', result);

            if (result.success && result.path && shouldSave) {
                // Recording saved - load it into the tab
                await handleLoadRecording(result.path, null);

                window.showAlert({
                    icon: 'check-circle',
                    iconColor: 'text-green-500',
                    title: 'Grabación Guardada',
                    message: 'La grabación se ha guardado y cargado correctamente.',
                    confirmText: 'Aceptar',
                    confirmColor: 'bg-green-600 hover:bg-green-700'
                });
            } else if (!shouldSave) {
                tab.isLoadingRecording = false;
                if (contentContainer) {
                    contentContainer.innerHTML = renderEmptyState(tabId);
                    if (window.lucide) lucide.createIcons();
                }

                window.showAlert({
                    icon: 'info',
                    iconColor: 'text-blue-500',
                    title: 'Grabación Descartada',
                    message: 'La grabación se ha detenido sin guardar.',
                    confirmText: 'Aceptar',
                    confirmColor: 'bg-blue-600 hover:bg-blue-700'
                });
            }
        } catch (e) {
            console.error('[AutoForm] Error stopping recording:', e);
            tab.isLoadingRecording = false;
            if (contentContainer) {
                contentContainer.innerHTML = renderEmptyState(tabId);
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    function getBrowserIcon(browser) {
        switch (browser) {
            case 'chrome': return 'chrome'; // Lucide doesn't have chrome, use globe or similar? 'chrome' exists in some sets
            case 'edge': return 'monitor';
            default: return 'globe';
        }
    }

    /**
     * Opens the Recording Manager modal
     */
    async function openRecordingManager(tabId) {
        currentManagerTabId = tabId;

        // Create modal if not exists
        let modal = document.getElementById('modal-recording-manager');
        if (!modal) {
            modal = createRecordingManagerModal();
            document.body.appendChild(modal);
        }

        // Load recordings list
        await refreshRecordingsList();

        // Delegate to robust ModalManager
        if (window.ModalManager) {
            window.ModalManager.openModal(modal);
        } else {
            // Fallback
            modal.classList.add('open');
        }

        if (window.lucide) lucide.createIcons();
    }

    function createRecordingManagerModal() {
        // Remove existing if any
        let existing = document.getElementById('modal-recording-manager');
        if (existing) existing.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'modal-recording-manager';
        modalOverlay.className = 'af-modal-overlay'; // Unified

        modalOverlay.innerHTML = `
            <div class="af-modal-window accent-orange" style="width: 600px; max-height: 80vh;">
                <div class="af-window-header">
                    <div class="af-window-title">
                        <i data-lucide="clapperboard" class="w-5 h-5 text-orange-500"></i>
                        <span>Gestor de Grabaciones</span>
                    </div>
                    <div class="af-window-close" onclick="AutoFormViewModule.closeRecordingManager()">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </div>
                </div>
                
                <div class="af-window-body" style="padding: 0; display:flex; flex-direction:column;">
                    <div class="flex-1 overflow-y-auto p-4" style="min-height: 200px;">
                        <div id="recordings-list" class="flex flex-col gap-2">
                             <!-- Loading State -->
                             <div class="text-center text-gray-400 py-8">
                                <i data-lucide="loader" class="w-8 h-8 mx-auto mb-2 animate-spin"></i>
                                <p>Cargando grabaciones...</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="af-window-footer" style="justify-content: space-between;">
                    <button onclick="AutoFormViewModule.importExternalRecording()"
                            class="af-btn-ghost border border-gray-200 flex items-center gap-2">
                        <i data-lucide="folder-plus" class="w-4 h-4"></i>
                        Importar Externo
                    </button>
                    <button onclick="AutoFormViewModule.openNewRecordingModal()"
                            class="af-btn-primary bg-orange-500 hover:bg-orange-600 border-none text-white flex items-center gap-2">
                        <i data-lucide="video" class="w-4 h-4"></i>
                        Nueva Grabación
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        // Make Draggable
        const win = modalOverlay.querySelector('.af-modal-window');
        const header = modalOverlay.querySelector('.af-window-header');

        if (window.ModalManager) {
            window.ModalManager.makeDraggable(win, header);
        }

        // Close on backdrop click
        modalOverlay.onmousedown = (e) => {
            if (e.target === modalOverlay) closeRecordingManager();
        };

        return modalOverlay;
    }

    async function refreshRecordingsList() {
        const listEl = document.getElementById('recordings-list');
        if (!listEl) return;

        // Get current tab's active recording to show indicator
        const tab = currentManagerTabId ? window.findTab(currentManagerTabId) : null;
        const activeRecPath = tab?.recordings?.find(r => r.id === tab.activeRecordingId)?.path;

        try {
            const result = await window.bridgePy.send('list_form_records', {});

            if (!result.success || !result.forms || result.forms.length === 0) {
                listEl.innerHTML = `
                    <div class="text-center text-gray-400 py-8">
                        <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-2 opacity-50"></i>
                        <p>No hay grabaciones guardadas</p>
                        <p class="text-xs mt-1">Importa un archivo .raf o crea una nueva grabación</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
                return;
            }

            // Render recordings with active indicator
            listEl.innerHTML = result.forms.map(form => {
                const isActive = form.path === activeRecPath;
                const cardClass = isActive
                    ? 'recording-card flex items-center gap-3 p-3 bg-orange-50 rounded-lg border-2 border-orange-300'
                    : 'recording-card flex items-center gap-3 p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors';
                const safePath = form.path.replace(/"/g, '&quot;');

                return `
                    <div class="${cardClass}" data-recording-path="${safePath}">
                        <i data-lucide="file-video" class="w-8 h-8 ${isActive ? 'text-orange-500' : 'text-orange-400'} flex-shrink-0"></i>
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-gray-800 truncate">
                                ${escHtml(form.name || form.filename)}
                                ${isActive ? '<span class="text-xs text-orange-500 ml-2">(activo)</span>' : ''}
                            </div>
                            <div class="text-xs text-gray-500 truncate">${escHtml(form.url || 'Sin URL')}</div>
                        </div>
                        <div class="flex items-center gap-1">
                            <button class="rec-btn-load p-2 hover:bg-orange-100 rounded text-orange-600" 
                                    data-action="load" title="Cargar en AutoForm">
                                <i data-lucide="arrow-right-circle" class="w-4 h-4"></i>
                            </button>
                            <button class="rec-btn-export p-2 hover:bg-blue-100 rounded text-blue-600" 
                                    data-action="export" title="Exportar">
                                <i data-lucide="download" class="w-4 h-4"></i>
                            </button>
                            <button class="rec-btn-delete p-2 hover:bg-red-100 rounded text-red-600" 
                                    data-action="delete" title="Eliminar">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Attach event handlers via delegation
            listEl.querySelectorAll('[data-action]').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const card = btn.closest('[data-recording-path]');
                    const path = card?.dataset.recordingPath;
                    if (!path) return;

                    const action = btn.dataset.action;
                    if (action === 'load') await handleLoadRecording(path, btn);
                    else if (action === 'export') await exportRecording(path);
                    else if (action === 'delete') await deleteRecording(path);
                };
            });

            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.error('[AutoForm] Error loading recordings:', e);
            listEl.innerHTML = `
                <div class="text-center text-red-400 py-8">
                    <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2"></i>
                    <p>Error al cargar grabaciones</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    function closeRecordingManager() {
        const modal = document.getElementById('modal-recording-manager');
        if (window.ModalManager) {
            window.ModalManager.closeModal(modal);
        } else {
            if (modal) modal.classList.remove('open');
        }
    }

    /**
     * Handle loading a recording with visual feedback
     * @param {string} path - Path to the recording file
     * @param {HTMLElement} btn - The button that was clicked (for spinner)
     */
    async function handleLoadRecording(path, btn) {
        if (!currentManagerTabId) return;

        const tab = window.findTab(currentManagerTabId);
        if (!tab) return;

        const modal = document.getElementById('modal-recording-manager');
        const originalBtnHtml = btn?.innerHTML;

        // Step 1: Show spinner on button, disable all buttons
        if (modal) {
            modal.querySelectorAll('button').forEach(b => b.disabled = true);
        }
        if (btn) {
            btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>';
            if (window.lucide) lucide.createIcons();
        }

        try {
            // Step 2: Save current state before switching
            syncToProjectData(currentManagerTabId);

            // Step 3: Check if recording exists or load new
            const existingRec = tab.recordings?.find(r => r.path === path);

            if (existingRec) {
                // Just switch to existing recording
                tab.activeRecordingId = existingRec.id;
            } else {
                // Load new recording from file
                const result = await window.bridgePy.send('load_form_record', { path });
                if (!result.success) {
                    throw new Error(result.error || 'Failed to load recording');
                }

                // Create new recording entry
                const newRecId = 'rec-' + Date.now();
                const fileName = path.split(/[/\\]/).pop();

                if (!tab.recordings) tab.recordings = [];
                tab.recordings.push({
                    id: newRecId,
                    name: fileName,
                    path: path,
                    data: result.data,
                    cards: buildCardsArray(result.data)
                });

                tab.activeRecordingId = newRecId;
            }

            // Step 4: Refresh modal to show new active state
            await refreshRecordingsList();

            // Step 5: Update internal state from active recording
            const activeRec = tab.recordings.find(r => r.id === tab.activeRecordingId);
            if (activeRec) {
                const state = tabs.get(currentManagerTabId);
                state.formData = JSON.parse(JSON.stringify(activeRec.data));
                state.filePath = activeRec.path;
                state.fileName = activeRec.name;

                // Apply cards to formData
                if (activeRec.cards && state.formData?.pages) {
                    activeRec.cards.forEach(card => {
                        const page = state.formData.pages[card.pageKey];
                        if (page?.questions?.[card.questionKey]) {
                            page.questions[card.questionKey].response = card.response;
                            page.questions[card.questionKey].selectedOptions = card.selectedOptions;
                        }
                    });
                }

                // Step 6: Update tab UI
                const rafNameEl = document.getElementById(`af-raf-name-${currentManagerTabId}`);
                if (rafNameEl) {
                    rafNameEl.textContent = state.fileName;
                    rafNameEl.classList.remove('empty');
                }

                // Step 7: Render the tab with new content
                renderEdit(currentManagerTabId);
            }

            // Step 8: Close modal after brief delay to show active state
            setTimeout(() => {
                closeRecordingManager();
                // Final autosave
                if (window.triggerAutoSave) window.triggerAutoSave();
            }, 300);

        } catch (e) {
            console.error('[AutoForm] Error loading recording:', e);
            // Restore button state on error
            if (btn) btn.innerHTML = originalBtnHtml;
            if (modal) modal.querySelectorAll('button').forEach(b => b.disabled = false);
            if (window.lucide) lucide.createIcons();
        }
    }

    // Keep legacy function for backward compatibility (not used from modal anymore)
    async function loadRecording(path) {
        await handleLoadRecording(path, null);
    }

    async function exportRecording(path) {
        try {
            const result = await window.bridgePy.send('select_save_dialog', {
                file_types: ['Raf Files (*.raf)'],
                default_name: path.split(/[/\\]/).pop()
            });

            if (result.success && result.path) {
                await window.bridgePy.send('copy_file', { source: path, dest: result.path });
            }
        } catch (e) {
            console.error('[AutoForm] Error exporting:', e);
        }
    }


    async function deleteRecording(path) {
        const fileName = path.split(/[/\\]/).pop();

        window.showAlert({
            icon: 'trash-2',
            iconColor: 'text-red-500',
            title: 'Eliminar Grabación',
            message: `¿Estás seguro de que deseas eliminar <strong>${fileName}</strong>?<br><span class="text-xs text-gray-400">Esta acción no se puede deshacer.</span>`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            confirmColor: 'bg-red-600 hover:bg-red-700',
            onConfirm: async () => {
                try {
                    await window.bridgePy.send('delete_form_record', { path });
                    await refreshRecordingsList();
                } catch (e) {
                    console.error('[AutoForm] Error deleting:', e);
                }
            }
        });
    }

    async function importExternalRecording() {
        const modal = document.getElementById('modal-recording-manager');
        const importBtn = modal?.querySelector('button[onclick*="importExternalRecording"]')
            || modal?.querySelector('.import-external-btn');
        const originalBtnHtml = importBtn?.innerHTML;

        try {
            // Step 1: Open file dialog
            const result = await window.bridgePy.send('select_file_dialog', {
                file_types: ['Raf Files (*.raf)']
            });

            if (!result.success || !result.path) {
                return; // User cancelled
            }

            // Step 2: Show spinner and disable buttons
            if (modal) {
                modal.querySelectorAll('button').forEach(b => b.disabled = true);
            }
            if (importBtn) {
                importBtn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Importando...';
                if (window.lucide) lucide.createIcons();
            }

            // Step 3: Import the file (copies to project's form_data folder)
            const importResult = await window.bridgePy.send('import_form_record', { path: result.path });

            if (!importResult.success) {
                throw new Error(importResult.error || 'Failed to import');
            }

            // Step 4: Refresh the list to show the new file
            await refreshRecordingsList();

            // Step 5: Re-enable buttons
            if (modal) {
                modal.querySelectorAll('button').forEach(b => b.disabled = false);
            }
            if (importBtn) {
                importBtn.innerHTML = originalBtnHtml;
                if (window.lucide) lucide.createIcons();
            }

        } catch (e) {
            console.error('[AutoForm] Error importing:', e);
            // Restore button state on error
            if (modal) {
                modal.querySelectorAll('button').forEach(b => b.disabled = false);
            }
            if (importBtn) {
                importBtn.innerHTML = originalBtnHtml;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ============================================================
    // 1.7 NEW RECORDING & ADVANCED CONFIG MODALS
    // ============================================================

    // Temporary state for recording configuration
    let tempRecordingConfig = {
        // Defaults matching BrowserConfig in browser_settings.py
        efficiency_profile: "efficiency",

        // Resources & Performance
        gpu_enabled: true,
        images_enabled: true,
        animations_enabled: true,
        extensions_enabled: false,
        cold_start_optimization: true,
        headless: false,

        // Anti-Detection / Mocking
        incognito: false,
        anti_detection_enabled: true,
        mock_webdriver: true,
        exclude_automation_switches: true,
        disable_webrtc_leak: true,
        spoof_plugins: true,
        randomize_window_size: true,

        // Window Size
        start_maximized: false,
        window_width_min: 1200,
        window_width_max: 1400,
        window_height_min: 800,
        window_height_max: 1000,

        // Timeouts
        page_load_timeout: 30,
        element_wait_timeout: 10,
        implicit_wait: 5,

        // Debug
        debug_mode: false
    };

    /**
     * Resets config to default values
     */
    function resetRecordingConfig() {
        tempRecordingConfig = {
            efficiency_profile: "efficiency",
            gpu_enabled: true,
            images_enabled: true,
            animations_enabled: true,
            extensions_enabled: false,
            cold_start_optimization: true,
            headless: false,
            incognito: false,
            anti_detection_enabled: true,
            mock_webdriver: true,
            exclude_automation_switches: true,
            disable_webrtc_leak: true,
            spoof_plugins: true,
            randomize_window_size: true,
            start_maximized: false,
            window_width_min: 1200,
            window_width_max: 1400,
            window_height_min: 800,
            window_height_max: 1000,
            page_load_timeout: 30,
            element_wait_timeout: 10,
            implicit_wait: 5,
            debug_mode: false
        };
    }

    /**
     * Opens the Advanced Configuration Modal
     */
    function openAdvancedConfigModal() {
        // Hide New Recording Modal if open
        const newRecModal = document.getElementById('modal-new-recording');
        if (newRecModal) newRecModal.style.display = 'none';

        let modal = document.getElementById('modal-advanced-config');
        if (modal) modal.remove();

        modal = createAdvancedConfigModal();
        document.body.appendChild(modal);

        if (window.ModalManager) {
            window.ModalManager.openModal(modal);
        } else {
            modal.classList.add('open');
        }

        if (window.lucide) lucide.createIcons();
    }

    function closeAdvancedConfigModal(save = false) {
        const modal = document.getElementById('modal-advanced-config');

        if (save) {
            // Harvest values from UI
            // Efficiency
            tempRecordingConfig.efficiency_profile = document.getElementById('adv-efficiency').value;

            // Performance
            tempRecordingConfig.gpu_enabled = document.getElementById('adv-gpu').checked;
            tempRecordingConfig.images_enabled = document.getElementById('adv-images').checked;
            tempRecordingConfig.headless = document.getElementById('adv-headless').checked;
            tempRecordingConfig.animations_enabled = document.getElementById('adv-animations').checked;
            tempRecordingConfig.cold_start_optimization = document.getElementById('adv-coldstart').checked;

            // Anti-Detection
            tempRecordingConfig.incognito = document.getElementById('adv-incognito').checked;
            tempRecordingConfig.anti_detection_enabled = document.getElementById('adv-antidetect').checked;
            tempRecordingConfig.mock_webdriver = document.getElementById('adv-webdriver').checked;
            tempRecordingConfig.randomize_window_size = document.getElementById('adv-randomsize').checked;
            tempRecordingConfig.disable_webrtc_leak = document.getElementById('adv-webrtc').checked;
            tempRecordingConfig.spoof_plugins = document.getElementById('adv-spoof').checked;

            // Window Size (from select dropdown)
            const windowMode = document.getElementById('adv-window-mode').value;
            tempRecordingConfig.start_maximized = (windowMode === 'maximized');
            tempRecordingConfig.randomize_window_size = (windowMode === 'random');
            tempRecordingConfig.window_width_min = parseInt(document.getElementById('adv-wmin').value) || 1200;
            tempRecordingConfig.window_width_max = parseInt(document.getElementById('adv-wmax').value) || 1400;
            tempRecordingConfig.window_height_min = parseInt(document.getElementById('adv-hmin').value) || 800;
            tempRecordingConfig.window_height_max = parseInt(document.getElementById('adv-hmax').value) || 1000;

            // Timeouts
            tempRecordingConfig.page_load_timeout = parseInt(document.getElementById('adv-pageload').value) || 30;
            tempRecordingConfig.element_wait_timeout = parseInt(document.getElementById('adv-elemwait').value) || 10;

            // Debug
            tempRecordingConfig.debug_mode = document.getElementById('adv-debug').checked;
        }

        if (window.ModalManager) {
            window.ModalManager.closeModal(modal);
        } else {
            if (modal) modal.classList.remove('open');
        }

        // Re-open New Recording Modal
        const newRecModal = document.getElementById('modal-new-recording');
        if (newRecModal) {
            newRecModal.style.display = 'flex'; // Ensure visible before animation
            // No need to call openModal again as it's already "open", just hidden
            // But if we want to be safe and ensure stacking:
            if (window.ModalManager) window.ModalManager.bringToFront(newRecModal);
        }
    }

    function createAdvancedConfigModal() {
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'modal-advanced-config';
        modalOverlay.className = 'af-modal-overlay';
        modalOverlay.style.zIndex = '10005'; // Higher than new recording

        const c = tempRecordingConfig; // Short alias for template

        modalOverlay.innerHTML = `
            <div class="af-modal-window accent-blue" style="width: 700px; max-height: 85vh;">
                <div class="af-window-header">
                    <div class="af-window-title">
                        <i data-lucide="settings-2" class="w-5 h-5 text-blue-500"></i>
                        <span>Configuración Avanzada</span>
                    </div>
                </div>

                <div class="af-window-body" style="padding: 0; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="flex-1 overflow-y-auto p-5 space-y-6">
                        
                        <!-- SECTION 1: EFFICIENCY -->
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-1">
                                <i data-lucide="zap" class="w-4 h-4 text-orange-500"></i> Perfil de Eficiencia
                            </h3>
                            <div class="af-config-row">
                                <select id="adv-efficiency" class="af-config-select" style="width:100%">
                                    <option value="normal" ${c.efficiency_profile === 'normal' ? 'selected' : ''}>Normal - Máxima compatibilidad (Carga todo)</option>
                                    <option value="balanced" ${c.efficiency_profile === 'balanced' ? 'selected' : ''}>Balanced - Optimización moderada</option>
                                    <option value="efficiency" ${c.efficiency_profile === 'efficiency' ? 'selected' : ''}>Efficiency - (Recomendado) Rápido pero visual</option>
                                    <option value="extreme" ${c.efficiency_profile === 'extreme' ? 'selected' : ''}>Extreme - Máxima velocidad (Sin imágenes/GPU)</option>
                                </select>
                            </div>
                        </div>

                        <!-- SECTION 2: ANTI-DETECTION -->
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-1">
                                <i data-lucide="shield" class="w-4 h-4 text-green-500"></i> Anti-Detection & Mocking
                            </h3>
                            <div class="grid grid-cols-2 gap-4">
                                <label class="af-checkbox-row" title="Usar modo incógnito (sin caché/historial)">
                                    <input type="checkbox" id="adv-incognito" ${c.incognito ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Incógnito / Sin Caché</span>
                                </label>
                                <label class="af-checkbox-row" title="Activa flags base anti-automatización">
                                    <input type="checkbox" id="adv-antidetect" ${c.anti_detection_enabled ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Anti-Detection Base</span>
                                </label>
                                <label class="af-checkbox-row" title="Ocultar propiedad navigator.webdriver">
                                    <input type="checkbox" id="adv-webdriver" ${c.mock_webdriver ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Ocultar WebDriver</span>
                                </label>
                                <label class="af-checkbox-row" title="Aleatorizar tamaño de ventana para evitar huella digital">
                                    <input type="checkbox" id="adv-randomsize" ${c.randomize_window_size ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Aleatorizar Tamaño Ventana</span>
                                </label>
                                <label class="af-checkbox-row" title="Prevenir fuga de IP real vía WebRTC">
                                    <input type="checkbox" id="adv-webrtc" ${c.disable_webrtc_leak ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Prevenir Fuga WebRTC</span>
                                </label>
                                <label class="af-checkbox-row" title="Simular plugins instalados">
                                    <input type="checkbox" id="adv-spoof" ${c.spoof_plugins ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Spoof Plugins</span>
                                </label>
                            </div>
                        </div>

                        <!-- SECTION 3: WINDOW SIZE -->
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-1">
                                <i data-lucide="maximize-2" class="w-4 h-4 text-indigo-500"></i> Tamaño de Ventana
                            </h3>
                            <div class="space-y-3">
                                <div class="af-config-row">
                                    <select id="adv-window-mode" class="af-config-select w-full" onchange="
                                        const opts = document.getElementById('adv-window-size-opts');
                                        opts.style.display = this.value === 'random' ? 'grid' : 'none';
                                    ">
                                        <option value="maximized" ${c.start_maximized ? 'selected' : ''}>Pantalla Completa (Maximizado)</option>
                                        <option value="random" ${!c.start_maximized && c.randomize_window_size ? 'selected' : ''}>Tamaño Aleatorio (Anti-Fingerprint)</option>
                                    </select>
                                </div>
                                <div id="adv-window-size-opts" class="grid grid-cols-2 gap-3" style="${c.start_maximized || !c.randomize_window_size ? 'display:none' : ''}">
                                    <div class="af-config-row flex-col items-start gap-1">
                                        <span class="text-xs text-gray-500">Ancho Mín</span>
                                        <input type="number" id="adv-wmin" class="af-config-input w-full" value="${c.window_width_min}">
                                    </div>
                                    <div class="af-config-row flex-col items-start gap-1">
                                        <span class="text-xs text-gray-500">Ancho Máx</span>
                                        <input type="number" id="adv-wmax" class="af-config-input w-full" value="${c.window_width_max}">
                                    </div>
                                    <div class="af-config-row flex-col items-start gap-1">
                                        <span class="text-xs text-gray-500">Alto Mín</span>
                                        <input type="number" id="adv-hmin" class="af-config-input w-full" value="${c.window_height_min}">
                                    </div>
                                    <div class="af-config-row flex-col items-start gap-1">
                                        <span class="text-xs text-gray-500">Alto Máx</span>
                                        <input type="number" id="adv-hmax" class="af-config-input w-full" value="${c.window_height_max}">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- SECTION 6: DEBUG MODE -->
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-1">
                                <i data-lucide="terminal" class="w-4 h-4 text-gray-500"></i> Desarrollo
                            </h3>
                            <label class="af-checkbox-row" title="Mostrar logs detallados del proceso de grabación">
                                <input type="checkbox" id="adv-debug" ${c.debug_mode ? 'checked' : ''} class="af-checkbox-blue">
                                <span>Modo Debug (Ver logs)</span>
                            </label>
                        </div>

                        <!-- SECTION 4: PERFORMANCE -->
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-1">
                                <i data-lucide="cpu" class="w-4 h-4 text-purple-500"></i> Recursos y Rendimiento
                            </h3>
                            <div class="grid grid-cols-2 gap-4">
                                <label class="af-checkbox-row" title="Ejecutar sin ventana visible (Rápido)">
                                    <input type="checkbox" id="adv-headless" ${c.headless ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Headless (Sin UI)</span>
                                </label>
                                <label class="af-checkbox-row" title="Usar aceleración gráfica">
                                    <input type="checkbox" id="adv-gpu" ${c.gpu_enabled ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Aceleración GPU</span>
                                </label>
                                <label class="af-checkbox-row" title="Cargar imágenes">
                                    <input type="checkbox" id="adv-images" ${c.images_enabled ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Cargar Imágenes</span>
                                </label>
                                <label class="af-checkbox-row" title="Permitir animaciones CSS">
                                    <input type="checkbox" id="adv-animations" ${c.animations_enabled ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Animaciones CSS</span>
                                </label>
                                <label class="af-checkbox-row" title="Optimizar inicio saltando diálogos">
                                    <input type="checkbox" id="adv-coldstart" ${c.cold_start_optimization ? 'checked' : ''} class="af-checkbox-blue">
                                    <span>Cold Start Opt.</span>
                                </label>
                            </div>
                        </div>

                        <!-- SECTION 4: TIMEOUTS -->
                        <div class="space-y-3">
                            <h3 class="text-sm font-bold text-gray-700 flex items-center gap-2 border-b pb-1">
                                <i data-lucide="timer" class="w-4 h-4 text-gray-500"></i> Tiempos (Segundos)
                            </h3>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="af-config-row flex-col items-start gap-1">
                                    <span class="text-xs font-medium text-gray-600">Carga de Página</span>
                                    <input type="number" id="adv-pageload" class="af-config-input w-full" value="${c.page_load_timeout}">
                                    <span class="text-xs text-gray-400">Máx. espera para que cargue la página completa</span>
                                </div>
                                <div class="af-config-row flex-col items-start gap-1">
                                    <span class="text-xs font-medium text-gray-600">Espera Elemento</span>
                                    <input type="number" id="adv-elemwait" class="af-config-input w-full" value="${c.element_wait_timeout}">
                                    <span class="text-xs text-gray-400">Máx. espera para encontrar un elemento específico</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div class="af-window-footer">
                    <button class="af-btn-ghost" onclick="AutoFormViewModule.closeAdvancedConfigModal(false)">
                        Cancelar
                    </button>
                    <button class="af-btn-primary bg-blue-600 hover:bg-blue-700 border-none text-white" onclick="AutoFormViewModule.closeAdvancedConfigModal(true)">
                        Guardar Configuración
                    </button>
                </div>
            </div>
        `;

        // Make Draggable
        const win = modalOverlay.querySelector('.af-modal-window');
        const header = modalOverlay.querySelector('.af-window-header');
        if (window.ModalManager) window.ModalManager.makeDraggable(win, header);

        return modalOverlay;
    }

    function openNewRecordingModal() {
        // Hide manager modal if open
        const managerModal = document.getElementById('modal-recording-manager');
        if (managerModal) managerModal.style.display = 'none';

        // ALWAYS recreate modal to ensure fresh state (no cached browser list)
        let existingModal = document.getElementById('modal-new-recording');
        if (existingModal) existingModal.remove();

        const modal = createNewRecordingModal();
        document.body.appendChild(modal);

        // Delegate to ModalManager (it will center automatically via CSS)
        if (window.ModalManager) {
            window.ModalManager.openModal(modal);
        } else {
            modal.classList.add('open');
        }

        if (window.lucide) lucide.createIcons();

        // Focus Filename input after modal is visible
        setTimeout(() => {
            const input = document.getElementById('new-rec-filename');
            if (input) input.focus();
        }, 100);

        // ALWAYS call browser detection when modal opens
        load_analyze_browsers_core();
    }

    function createNewRecordingModal() {
        let existing = document.getElementById('modal-new-recording');
        if (existing) existing.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'modal-new-recording';
        modalOverlay.className = 'af-modal-overlay';
        modalOverlay.style.zIndex = '10002'; // Above manager

        modalOverlay.innerHTML = `
            <div class="af-modal-window accent-orange" style="width: 420px;">
                <div class="af-window-header">
                    <div class="af-window-title">
                        <i data-lucide="video" class="w-5 h-5"></i>
                        <span>Nueva Grabación</span>
                    </div>
                    <div class="af-window-close" onclick="AutoFormViewModule.closeNewRecordingModal()">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </div>
                </div>
                
                <div class="af-window-body" style="padding: 0; overflow: hidden;">
                    <!-- NORMAL VIEW -->
                    <div id="new-rec-normal" class="p-5 space-y-4">
                        <!-- Filename -->
                        <div class="af-config-section">
                            <div class="af-config-sec-title">Nombre del Archivo</div>
                            <div class="af-config-row">
                                <input type="text" id="new-rec-filename" class="af-config-input" style="flex:1" placeholder="mi_grabacion">
                                <span class="text-xs text-gray-500 ml-1">.raf</span>
                            </div>
                        </div>

                        <!-- URL -->
                        <div class="af-config-section">
                            <div class="af-config-sec-title">URL Inicial</div>
                            <div class="af-config-row">
                                <input type="url" id="new-rec-url" class="af-config-input" style="flex:1" placeholder="https://ejemplo.com">
                            </div>
                        </div>

                        <!-- Browser -->
                        <div class="af-config-section">
                            <div class="af-config-sec-title">Navegador</div>
                            <div class="af-config-row" style="gap: 8px; align-items: center;">
                                <select id="new-rec-browser" class="af-config-select" style="flex:1" disabled>
                                    <option value="">Cargando navegadores...</option>
                                </select>
                                <div id="new-rec-browser-spinner" class="af-browser-spinner">
                                    <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                                </div>
                            </div>
                        </div>

                        <!-- Advanced Options Link -->
                        <div class="mt-4 flex justify-between items-center px-1">
                            <button onclick="AutoFormViewModule.openAdvancedConfigModal()" 
                                    class="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
                                <i data-lucide="settings-2" class="w-4 h-4"></i>
                                Opciones Avanzadas
                            </button>
                        </div>
                    </div>

                    <!-- DEBUG VIEW (Hidden by default) -->
                    <div id="new-rec-debug" class="flex flex-col h-full" style="display: none;">
                        <!-- Fixed Info Header -->
                        <div class="px-4 py-3 bg-gray-800 text-white border-b border-gray-700">
                            <div class="flex items-center gap-3 text-xs">
                                <span class="flex items-center gap-1"><i data-lucide="globe" class="w-3 h-3 text-blue-400"></i> <span id="debug-url" class="text-gray-300">-</span></span>
                                <span class="flex items-center gap-1"><i data-lucide="chrome" class="w-3 h-3 text-green-400"></i> <span id="debug-browser" class="text-gray-300">-</span></span>
                            </div>
                        </div>
                        <!-- Console Log Area -->
                        <div class="flex-1 bg-gray-900 p-3 overflow-hidden">
                            <textarea id="debug-console" readonly 
                                class="w-full h-full bg-transparent text-green-400 text-xs font-mono resize-none border-none outline-none"
                                style="min-height: 200px;"
                                placeholder="[Log del proceso de apertura...]">[00:00:00] Modo Debug activado. Esperando inicio de grabación...</textarea>
                        </div>
                    </div>
                </div>
                
                <div class="af-window-footer">
                    <div style="flex:1"></div>
                    <button class="af-btn-ghost" onclick="AutoFormViewModule.closeNewRecordingModal()">
                        Cancelar
                    </button>
                    <button class="af-btn-primary" onclick="AutoFormViewModule.startNewRecording()" style="display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;">
                        <i data-lucide="circle" class="w-4 h-4" style="fill: currentColor;"></i>
                        Iniciar Grabación
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        // Make Draggable
        const win = modalOverlay.querySelector('.af-modal-window');
        const header = modalOverlay.querySelector('.af-window-header');
        if (window.ModalManager) window.ModalManager.makeDraggable(win, header);

        return modalOverlay;
    }

    /**
     * CORE: Detect and load available browsers into the select element
     * Called every time the New Recording modal opens
     * 
     * Flow:
     * 1. Block/disable the select list
     * 2. Show spinner
     * 3. Call backend detect_browsers and wait for data
     * 4. Update select list with browser data
     * 5. Unblock/enable the select list
     * 6. Hide spinner
     */
    async function load_analyze_browsers_core() {
        const selectEl = document.getElementById('new-rec-browser');
        const spinnerEl = document.getElementById('new-rec-browser-spinner');

        if (!selectEl) {
            console.error('[AutoForm] Browser select element not found');
            return;
        }

        // 1. Block list
        selectEl.disabled = true;
        selectEl.innerHTML = '<option value="">Detectando navegadores...</option>';

        // 2. Show spinner
        if (spinnerEl) spinnerEl.style.display = 'flex';

        try {
            // 3. Call backend and wait for data
            console.log('[AutoForm] Calling detect_browsers...');
            const result = await window.bridgePy.send('detect_browsers', {});
            console.log('[AutoForm] detect_browsers result:', result);

            // 4. Update list with browser data
            selectEl.innerHTML = '';

            if (result.success && result.browsers && result.browsers.length > 0) {
                result.browsers.forEach((browser, index) => {
                    const option = document.createElement('option');
                    option.value = browser.name;
                    option.textContent = browser.display;
                    option.dataset.path = browser.path || '';
                    if (index === 0) option.selected = true;
                    selectEl.appendChild(option);
                });

                // 5. Unblock list (success)
                selectEl.disabled = false;
            } else {
                // No browsers found - keep blocked
                selectEl.innerHTML = '<option value="">No se encontraron navegadores</option>';
                selectEl.disabled = true;
            }
        } catch (e) {
            console.error('[AutoForm] Error detecting browsers:', e);
            selectEl.innerHTML = '<option value="">Error al detectar navegadores</option>';
            selectEl.disabled = true;
        } finally {
            // 6. Hide spinner
            if (spinnerEl) spinnerEl.style.display = 'none';
            if (window.lucide) lucide.createIcons();
        }
    }

    /**
     * Toggle between normal and debug views in New Recording modal
     */
    function toggleDebugMode(enabled) {
        const normalView = document.getElementById('new-rec-normal');
        const debugView = document.getElementById('new-rec-debug');

        if (enabled) {
            // Switch to debug view
            if (normalView) normalView.style.display = 'none';
            if (debugView) debugView.style.display = 'flex';

            // Update debug info from current form values
            const url = document.getElementById('new-rec-url')?.value || '-';
            const browserSelect = document.getElementById('new-rec-browser');
            const browser = browserSelect?.options[browserSelect.selectedIndex]?.text || '-';

            const debugUrl = document.getElementById('debug-url');
            const debugBrowser = document.getElementById('debug-browser');
            if (debugUrl) debugUrl.textContent = url || '-';
            if (debugBrowser) debugBrowser.textContent = browser || '-';

            if (window.lucide) lucide.createIcons();
        } else {
            // Switch to normal view
            if (normalView) normalView.style.display = 'block';
            if (debugView) debugView.style.display = 'none';
        }
    }

    function closeNewRecordingModal() {
        const modal = document.getElementById('modal-new-recording');
        if (window.ModalManager) {
            window.ModalManager.closeModal(modal);
        } else if (modal) {
            modal.classList.remove('open');
        }

        // Restore manager modal if it exists (Stacking behavior)
        const managerModal = document.getElementById('modal-recording-manager');
        if (managerModal) {
            // Slight delay to allow smooth transition overlap or immediate
            managerModal.style.display = 'flex';
        }
    }

    async function startNewRecording() {
        const filenameEl = document.getElementById('new-rec-filename');
        const urlEl = document.getElementById('new-rec-url');
        const browserEl = document.getElementById('new-rec-browser');
        const startBtn = document.querySelector('#modal-new-recording .af-btn-primary');

        if (!filenameEl || !urlEl || !browserEl) return;

        const filename = filenameEl.value.trim() || `recording_${Date.now()}`;
        const url = urlEl.value.trim();
        const browser = browserEl.value;

        if (!url) {
            window.showAlert({ icon: 'alert-triangle', title: 'URL Requerida', message: 'Por favor ingresa una URL válida.', confirmColor: 'bg-orange-500' });
            return;
        }

        if (!browser) {
            window.showAlert({ icon: 'alert-triangle', title: 'Navegador Requerido', message: 'Por favor selecciona un navegador.', confirmColor: 'bg-orange-500' });
            return;
        }

        console.log('[AutoForm] Starting Recording:', { filename, url, browser, config: tempRecordingConfig });

        // Show spinner on button (keep modal open until connected)
        const originalBtnHtml = startBtn?.innerHTML || '';
        if (startBtn) {
            startBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Conectando...';
            startBtn.disabled = true;
            if (window.lucide) lucide.createIcons();
        }

        // If debug mode is enabled, switch to debug view
        if (tempRecordingConfig.debug_mode) {
            toggleDebugMode(true);
            // Add initial log entry
            const console_el = document.getElementById('debug-console');
            if (console_el) {
                const now = new Date().toLocaleTimeString('es-CO', { hour12: false });
                console_el.value = `[${now}] Iniciando grabación...\n[${now}] URL: ${url}\n[${now}] Browser: ${browser}\n[${now}] Conectando con Selenium...`;
            }
        }

        // Store tabId for event handlers
        const tabId = currentManagerTabId;

        try {
            // Call backend to start recording
            const result = await window.bridgePy.send('start_recording', {
                filename: filename,
                url: url,
                browser: browser,
                browser_config: tempRecordingConfig
            });

            console.log('[AutoForm] start_recording result:', result);

            if (result.success && result.connected) {
                // Connection successful

                // If NOT in debug mode, close modals
                if (!tempRecordingConfig.debug_mode) {
                    const newModal = document.getElementById('modal-new-recording');
                    if (window.ModalManager) window.ModalManager.closeModal(newModal);
                    else newModal?.classList.remove('open');

                    const managerModal = document.getElementById('modal-recording-manager');
                    if (window.ModalManager && managerModal) {
                        window.ModalManager.closeModal(managerModal);
                        managerModal.style.display = 'none';
                    } else if (managerModal) {
                        managerModal.classList.remove('open');
                    }
                } else {
                    // In debug mode: keep modal open, add log entry
                    const console_el = document.getElementById('debug-console');
                    if (console_el) {
                        const now = new Date().toLocaleTimeString('es-CO', { hour12: false });
                        console_el.value += `\n[${now}] ✓ Conexión establecida con Selenium`;
                        console_el.scrollTop = console_el.scrollHeight;
                    }
                }

                // Set Recording State
                if (tabId) {
                    const localState = tabs.get(tabId);
                    if (localState) {
                        localState.isRecording = true;
                        localState.recordingInfo = {
                            filename: filename + '.raf',
                            url: url,
                            browser: browser
                        };
                    }

                    const globalTab = window.findTab ? window.findTab(tabId) : null;
                    if (globalTab) {
                        globalTab.isRecording = true;
                        globalTab.recordingInfo = {
                            filename: filename + '.raf',
                            url: url,
                            browser: browser
                        };
                    }

                    renderInfoBar(tabId);

                    const contentContainer = document.getElementById(`af-container-edit-${tabId}`);
                    if (contentContainer) {
                        contentContainer.innerHTML = renderEmptyState(tabId);
                        if (window.lucide) lucide.createIcons();
                    }

                    // Activate the tab that launched the recording
                    if (window.TemplateViewModule && window.TemplateViewModule.activateTab) {
                        window.TemplateViewModule.activateTab(tabId);
                    }
                }
            } else {
                // Error - restore button
                throw new Error(result.error || 'Failed to start recording');
            }
        } catch (e) {
            console.error('[AutoForm] Error starting recording:', e);

            // Restore button state
            if (startBtn) {
                startBtn.innerHTML = originalBtnHtml;
                startBtn.disabled = false;
                if (window.lucide) lucide.createIcons();
            }

            window.showAlert({
                icon: 'alert-circle',
                iconColor: 'text-red-500',
                title: 'Error al Iniciar',
                message: `No se pudo iniciar la grabación: ${e.message || e}`,
                confirmText: 'Entendido',
                confirmColor: 'bg-red-600 hover:bg-red-700'
            });
        }
    }

    // ============================================================
    // 2. TOGGLE EVENTS
    // ============================================================

    function setupToggleEvents(tabId, root) {
        const btnEdit = root.querySelector(`#af-tog-edit-${tabId}`);
        const btnView = root.querySelector(`#af-tog-view-${tabId}`);
        const editDiv = root.querySelector(`#af-edit-${tabId}`);
        const viewDiv = root.querySelector(`#af-view-${tabId}`);

        const setMode = (isEdit) => {
            // Trigger autosave BEFORE changing mode to persist current state
            syncToProjectData(tabId);

            if (isEdit) {
                btnEdit.classList.add('active-edit');
                btnView.classList.remove('active-view');
                editDiv.style.display = 'flex';
                viewDiv.style.display = 'none';
            } else {
                btnView.classList.add('active-view');
                btnEdit.classList.remove('active-edit');
                viewDiv.style.display = 'flex';
                editDiv.style.display = 'none';
                renderViewMode(tabId);
            }
            if (window.lucide) lucide.createIcons();

            // Persist mode change after UI update
            syncToProjectData(tabId);
        };

        btnEdit.onclick = () => setMode(true);
        btnView.onclick = () => setMode(false);

        // If view mode was restored, render the view content (HTML is already correct, no need for setMode)
        const tabData = window.findTab ? window.findTab(tabId) : null;
        if (tabData?.uiState?.mode === 'view') {
            // Just render the view content, UI is already in view mode
            setTimeout(() => renderViewMode(tabId), 0);
        }
    }

    function updateUrl(tabId, url) {
        const state = tabs.get(tabId);
        if (state.formData) {
            state.formData.url = url;
            syncToProjectData(tabId);
        }
    }

    function openUrl(tabId) {
        const state = tabs.get(tabId);
        if (state.formData && state.formData.url) {
            window.open(state.formData.url, '_blank');
        }
    }

    // ============================================================
    // 3. EDIT MODE RENDERER
    // ============================================================

    function renderEdit(tabId) {
        const state = tabs.get(tabId);
        const container = document.getElementById(`af-container-edit-${tabId}`);
        const toggleGroup = document.getElementById(`af-toggle-group-${tabId}`);
        const urlSection = document.getElementById(`af-url-section-${tabId}`);
        const urlText = document.getElementById(`af-url-text-${tabId}`);
        const divider = document.getElementById(`af-divider-${tabId}`);

        if (toggleGroup) toggleGroup.style.display = state.formData ? 'flex' : 'none';

        // Show/hide URL section based on whether we have a loaded file
        if (urlSection) urlSection.style.display = state.formData ? 'flex' : 'none';
        if (divider) divider.style.display = state.formData ? 'block' : 'none';
        if (urlText && state.formData) {
            urlText.value = state.formData?.url || '';
            urlText.title = state.formData?.url || '';
        }

        if (!container || !state.formData) return;

        container.innerHTML = '';
        const pages = state.formData.pages || {};
        const sortedPages = getSortedPages(pages);
        let globalActionIndex = 0;

        sortedPages.forEach((pKey, index) => {
            const page = pages[pKey];
            const sectionCard = document.createElement('div');
            sectionCard.className = 'af-section-card';
            sectionCard.style.flexShrink = '0';

            const pCurrent = page.pageInfo?.current || '?';
            const pTotal = page.pageInfo?.total || '?';

            // Sequential Page Number: index + 1
            const seqPageNum = index + 1;

            sectionCard.innerHTML = `
                <div class="af-section-header">
                    <div style="display:flex;align-items:center;">
                        <i data-lucide="layers" style="width:16px;color:#f97316;margin-right:8px;"></i>
                        <span style="font-size:13px;font-weight:700;">PÁGINA ${seqPageNum}</span>
                    </div>
                    <span class="af-section-chip">SECCIÓN ${pCurrent}/${pTotal}</span>
                </div>
                <div class="questions-container" id="af-page-body-${pKey}"></div>
            `;
            container.appendChild(sectionCard);

            const pageBody = sectionCard.querySelector(`#af-page-body-${pKey}`);

            getSortedQuestions(page.questions || {}).forEach(qKey => {
                globalActionIndex++;
                pageBody.appendChild(createCard(tabId, pKey, qKey, page.questions[qKey], globalActionIndex, false));
            });

            const nav = page.navigation || {};
            if (nav.next) {
                globalActionIndex++;
                pageBody.appendChild(createClickCard(tabId, globalActionIndex, 'Siguiente', nav.next));
            }
            if (nav.submit) {
                globalActionIndex++;
                pageBody.appendChild(createClickCard(tabId, globalActionIndex, 'Enviar', nav.submit));
            }
        });

        if (window.lucide) lucide.createIcons();

        // Initialize smart inputs for chip rendering
        initSmartInputs();
        initSmartTextareas();
    }

    function createCard(tabId, pKey, qKey, q, num, isViewMode, selectedData = {}) {
        const card = document.createElement('div');
        const action = q.selenium?.action || 'fill';
        const type = q.type || 'text';
        const isSelect = action === 'select' || type === 'choice';

        // Extract question number from qKey (e.g., "q3" -> 3)
        const questionNum = parseInt(qKey.replace(/\D/g, ''), 10) || num;

        // Icon logic
        const iconName = isSelect ? 'list' : 'type';
        const typeLabel = isSelect ? 'SELECCIÓN' : 'RELLENAR';

        card.className = `af-action-card ${isSelect ? 'select' : 'fill'}`;
        card.style.flexShrink = '0';

        let bodyHtml = '';

        // HEADER
        const headerHtml = `
            <div class="af-card-header">
                <div style="display:flex;align-items:center">
                    <span class="af-card-num">${num}</span>
                    <span class="af-type-chip ${isSelect ? 'select' : 'fill'}">
                        <i data-lucide="${iconName}" style="width:12px;height:12px;margin-right:4px;"></i>
                        ${typeLabel}
                    </span>
                 </div>
                 ${!isViewMode ? `
                    <div style="display:flex;align-items:center;">
                        ${!isSelect ? `<span class="af-text-type-chip ${q.config?.textType === 'long' ? 'long' : 'short'}">${q.config?.textType === 'long' ? 'Párrafo' : 'Corto'}</span>` : ''}
                        <div class="af-config-wrapper ${q.config?.isCustomized ? 'customized' : ''} ${isSelect ? 'accent-purple' : 'accent-blue'}">
                            <button class="af-settings-btn" style="border:none;background:transparent;cursor:pointer;padding:4px" 
                                    title="Configurar Acción" id="af-btn-cfg-${tabId}-${pKey}-${qKey}">
                                <i data-lucide="settings-2" style="width:14px"></i>
                            </button>
                            ${q.config?.isCustomized ? '<span class="af-config-check"><i data-lucide="check"></i></span>' : ''}
                        </div>
                    </div>
                 ` : ''}
            </div>
        `;

        // BODY
        // BODY WRAPPER
        bodyHtml += `<div class="af-card-body">`;

        bodyHtml += `<div class="af-question-title"><span class="af-q-num">${questionNum}.</span> ${q.text || 'Sin texto'}</div>`;

        const rawVal = q.response || '';
        const displayVal = isViewMode ? processPlaceholders(rawVal, selectedData) : rawVal;

        if (isSelect && q.options?.length) {
            const isMapped = q.config?.mapping?.enabled;
            const mappedPlaceholder = q.config?.mapping?.placeholder || '';

            bodyHtml += `<div class="af-opts ${isMapped ? 'mapped-mode' : ''}">`;
            q.options.forEach(opt => {
                const val = opt.value || opt.text;
                // Don't show selected when in mapped mode
                const isSelected = !isMapped && (rawVal === val);
                let itemClass = 'af-opt';
                if (isSelected) itemClass += ' selected';
                if (isMapped) itemClass += ' disabled';

                // Disable clicks when in mapped mode
                const clickAttr = (!isViewMode && !isMapped)
                    ? `onclick="AutoFormViewModule.setOption('${tabId}','${pKey}','${qKey}','${escJs(val)}')"`
                    : '';

                // Get mapped value for this option (if in mapped mode)
                let mappedChipHtml = '';
                if (isMapped && q.config?.mapping?.map) {
                    const mappedVal = q.config.mapping.map[val];
                    if (mappedVal) {
                        // Remove brackets if present
                        const cleanVal = mappedVal.replace(/^\{|\}$/g, '');
                        mappedChipHtml = `<span class="af-opt-mapped-chip">${escHtml(cleanVal)}</span>`;
                    }
                }

                bodyHtml += `
                    <div class="${itemClass}" ${clickAttr}>
                        <div class="af-radio"></div>
                        <span>${opt.text}</span>
                        ${mappedChipHtml}
                    </div>
                `;
            });
            bodyHtml += `</div>`;
        } else {
            if (isViewMode) {
                const hasVal = displayVal && displayVal.trim() !== '';
                bodyHtml += `
                    <input type="text" class="af-input ${hasVal ? 'has-val' : ''}" 
                           readonly value="${escHtml(displayVal)}" placeholder="(Vacío)">
                `;
            } else {
                const inputType = type.includes('number') ? 'number' : 'text';
                const inputId = `af-input-${tabId}-${pKey}-${qKey}`;
                const backdropId = `af-backdrop-${tabId}-${pKey}-${qKey}`;
                const actionClass = isSelect ? 'select' : 'fill';
                const isLongText = q.config?.textType === 'long';

                if (isLongText) {
                    // Long text - use textarea
                    bodyHtml += `
                        <div class="af-smart-textarea-container" data-action-type="${actionClass}">
                            <div id="${backdropId}" class="af-smart-textarea-backdrop"></div>
                            <textarea id="${inputId}" class="af-smart-textarea"
                                      placeholder="{Columna} o texto largo..."
                                      data-tab="${tabId}" data-page="${pKey}" data-question="${qKey}"
                                      oninput="AutoFormViewModule.handleSmartTextarea(this)">${escHtml(rawVal)}</textarea>
                        </div>
                    `;
                } else {
                    // Short text - use input
                    bodyHtml += `
                        <div class="af-smart-input-container" data-action-type="${actionClass}">
                            <div id="${backdropId}" class="af-smart-backdrop"></div>
                            <input type="text" id="${inputId}" class="af-smart-text-input" 
                                   value="${escHtml(rawVal)}" 
                                   placeholder="${inputType === 'number' ? '123 o {Columna}' : '{Columna} o valor fijo'}"
                                   data-input-type="${inputType}"
                                   data-tab="${tabId}" data-page="${pKey}" data-question="${qKey}"
                                   oninput="AutoFormViewModule.handleSmartInput(this)">
                        </div>
                    `;
                }
            }
        }

        bodyHtml += `</div>`; // End Body Wrapper

        // FOOTER
        bodyHtml += `<div class="af-card-footer" style="display:flex;justify-content:space-between;align-items:center;min-height:20px;">`;

        // Left side: Mapping indicator OR error message
        if (isSelect && q.config?.mapping?.enabled && q.config?.mapping?.placeholder) {
            const placeholder = q.config.mapping.placeholder;
            bodyHtml += `
                <div class="af-mapped-indicator" style="display:flex;align-items:center;gap:6px;font-size:11px;color:#7e22ce;">
                    <span style="color:#9ca3af;">Mapeado:</span>
                    <span class="af-mapped-chip">${escHtml(placeholder)}</span>
                </div>
            `;
        } else {
            bodyHtml += `
                <div class="af-error-msg" style="display:none;align-items:center;color:#ef4444;font-size:11px;gap:4px;">
                    <i data-lucide="alert-circle" style="width:14px;height:14px"></i>
                    <span>Debe ser un número</span>
                </div>
            `;
        }

        if (q.required) {
            bodyHtml += `<div class="af-req" style="margin-left:auto;">* Obligatoria</div>`;
        }
        bodyHtml += `</div>`;

        card.innerHTML = headerHtml + bodyHtml;

        // Attach Event for Settings
        if (!isViewMode) {
            const settingsBtn = card.querySelector(`#af-btn-cfg-${tabId}-${pKey}-${qKey}`);
            if (settingsBtn) {
                settingsBtn.onclick = (e) => {
                    e.stopPropagation();
                    const ctx = { options: q.options || [] };
                    ActionConfigModal.open(q, action, ctx, (newConfig) => {
                        q.config = newConfig;
                        syncToProjectData(tabId);
                        renderEdit(tabId);
                    });
                };
            }
        }

        return card;
    }

    function createClickCard(tabId, num, label, navObj) {
        const card = document.createElement('div');
        const action = 'click';

        card.className = 'af-action-card click';
        card.style.flexShrink = '0';

        const rawSelectors = navObj.selectors || [];
        const selectorText = rawSelectors.length > 0 ? rawSelectors[0].value : '(Sin selector)';
        const cardId = `af-click-${tabId}-${num}`;

        card.innerHTML = `
            <div class="af-card-header">
                <div style="display:flex;align-items:center">
                    <span class="af-card-num">${num}</span>
                    <span class="af-type-chip click">
                        <i data-lucide="mouse-pointer-click" style="width:12px;height:12px;margin-right:4px;"></i>
                        CLICK
                    </span>
                </div>
                 <div class="af-config-wrapper ${navObj.config?.isCustomized ? 'customized' : ''} accent-green">
                    <button class="af-settings-btn" style="border:none;background:transparent;cursor:pointer;padding:4px" 
                            title="Configurar Navegación" id="${cardId}">
                        <i data-lucide="settings-2" style="width:14px"></i>
                    </button>
                    ${navObj.config?.isCustomized ? '<span class="af-config-check"><i data-lucide="check"></i></span>' : ''}
                </div>
            </div>
            <div class="af-card-body">
                <div class="af-question-title">Acción: ${label}</div>
                <div style="font-size:11px; color:#6b7280; margin-top:4px; font-family:monospace; background:#f3f4f6; padding:4px; border-radius:4px;">
                    ${escHtml(selectorText)}
                </div>
            </div>
        `;

        // Attach event
        setTimeout(() => {
            const btn = card.querySelector(`#${cardId}`);
            if (btn) {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    ActionConfigModal.open(navObj, 'click', {}, (newConfig) => {
                        navObj.config = newConfig;
                        syncToProjectData(tabId);
                        renderEdit(tabId);
                    });
                }
            }
        }, 0);

        return card;
    }

    // ============================================================
    // 4. HELPER FUNCTIONS
    // ============================================================

    function getSortedPages(pages) {
        return Object.keys(pages).sort((a, b) => parseInt(a.replace('page_', '')) - parseInt(b.replace('page_', '')));
    }
    function getSortedQuestions(qs) {
        return Object.keys(qs).sort((a, b) => parseInt(a.replace('q', '')) - parseInt(b.replace('q', '')));
    }
    function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function escJs(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function processPlaceholders(text, data) {
        if (!text) return text;
        return text.replace(/\{([^}]+)\}/g, (m, col) => {
            const val = data?.[col] ?? data?.[col.toLowerCase()];
            return val !== undefined ? val : m;
        });
    }

    async function openFileManager(tabId) {
        try {
            const s = await window.bridgePy.send('select_file_dialog', { file_types: ['Raf Files (*.raf)'] });
            if (s.success && s.path) {
                const l = await window.bridgePy.send('load_form_record', { path: s.path });
                if (l.success) {
                    const state = tabs.get(tabId);
                    state.formData = l.data;
                    state.filePath = s.path;
                    state.fileName = s.path.split(/[/\\]/).pop();

                    // Update the recording file name display
                    const rafNameEl = document.getElementById(`af-raf-name-${tabId}`);
                    if (rafNameEl) {
                        rafNameEl.textContent = state.fileName;
                        rafNameEl.classList.remove('empty');
                    }

                    renderEdit(tabId);
                    syncToProjectData(tabId);
                }
            }
        } catch (e) { console.error(e); }
    }

    function setValue(tabId, pKey, qKey, val) {
        const s = tabs.get(tabId);
        if (s?.formData?.pages?.[pKey]?.questions?.[qKey]) {
            s.formData.pages[pKey].questions[qKey].response = val;
            syncToProjectData(tabId);
        }
    }

    function setOption(tabId, pKey, qKey, val) {
        const s = tabs.get(tabId);
        if (s?.formData?.pages?.[pKey]?.questions?.[qKey]) {
            s.formData.pages[pKey].questions[qKey].response = val;
            renderEdit(tabId);
            syncToProjectData(tabId);
        }
    }

    function handleInputWithValidation(inputEl, tabId, pKey, qKey, type) {
        const val = inputEl.value;
        const card = inputEl.closest('.af-action-card');
        const errorMsgEl = card ? card.querySelector('.af-error-msg') : null;

        let isValid = true;

        if (type === 'number') {
            if (!val || val.trim() === '') {
                isValid = true;
            } else if (/^\{.*\}$/.test(val.trim())) {
                isValid = true;
            } else {
                isValid = /^-?\d*(\.\d+)?$/.test(val);
            }
        }

        if (!isValid) {
            inputEl.classList.add('error');
            if (errorMsgEl) {
                errorMsgEl.style.display = 'flex';
                // ensure icon is rendered
                if (window.lucide) lucide.createIcons();
            }
        } else {
            inputEl.classList.remove('error');
            if (errorMsgEl) errorMsgEl.style.display = 'none';
        }

        setValue(tabId, pKey, qKey, val);
    }

    /**
     * Smart Input handler - renders chips in backdrop and validates columns
     * Uses DOM manipulation for perfect text synchronization
     * @param {HTMLInputElement} inputEl - The input element
     */
    function handleSmartInput(inputEl) {
        const tabId = inputEl.dataset.tab;
        const pKey = inputEl.dataset.page;
        const qKey = inputEl.dataset.question;
        const inputType = inputEl.dataset.inputType;
        const val = inputEl.value;

        // Get the container and backdrop
        const container = inputEl.closest('.af-smart-input-container');
        const actionType = container?.dataset.actionType || 'fill';
        const backdropId = inputEl.id.replace('af-input-', 'af-backdrop-');
        const backdrop = document.getElementById(backdropId);

        // Render chips in backdrop using DOM manipulation
        if (backdrop) {
            // Clear backdrop
            backdrop.innerHTML = '';

            // Parse and render chips using combined regex for {} and [[]]
            const headers = window.globalHeaders || [];

            // Get concept tabs titles for validation
            const conceptTitles = (window.projectData?.tabs || [])
                .filter(t => t.type === 'concept' || (!t.type && t.content !== undefined))
                .map(t => t.title?.toLowerCase().trim())
                .filter(Boolean);

            let lastIndex = 0;
            // Combined regex: matches {column} OR [[concept]]
            const regex = /\{([^{}]+)\}|\[\[([^\[\]]+)\]\]/g;
            let match;

            while ((match = regex.exec(val)) !== null) {
                // Text before match
                const textBefore = val.substring(lastIndex, match.index);
                if (textBefore) {
                    backdrop.appendChild(document.createTextNode(textBefore));
                }

                // Create chip span
                const chip = document.createElement('span');
                chip.className = 'af-input-chip';

                if (match[1] !== undefined) {
                    // It's a {column} placeholder
                    const colName = match[1];
                    const cleanName = colName.trim();

                    if (headers.length > 0) {
                        const isValidCol = headers.includes(cleanName);
                        chip.classList.add(isValidCol
                            ? (actionType === 'select' ? 'valid-select' : 'valid-fill')
                            : 'invalid'
                        );
                    } else {
                        chip.classList.add(actionType === 'select' ? 'valid-select' : 'valid-fill');
                    }
                } else if (match[2] !== undefined) {
                    // It's a [[concept]] placeholder
                    const conceptName = match[2].trim().toLowerCase();
                    const isValidConcept = conceptTitles.includes(conceptName);
                    chip.classList.add(isValidConcept ? 'valid-concept' : 'invalid');
                }

                // Set chip text with exact content
                chip.textContent = match[0];
                backdrop.appendChild(chip);

                lastIndex = regex.lastIndex;
            }

            // Remaining text after last match
            const textAfter = val.substring(lastIndex);
            if (textAfter) {
                backdrop.appendChild(document.createTextNode(textAfter));
            }

            // Sync scroll
            backdrop.scrollLeft = inputEl.scrollLeft;
        }

        // Handle number validation for error display
        const card = inputEl.closest('.af-action-card');
        const errorMsgEl = card ? card.querySelector('.af-error-msg') : null;
        let isValid = true;

        if (inputType === 'number') {
            if (!val || val.trim() === '') {
                isValid = true;
            } else if (/^\{.*\}$/.test(val.trim())) {
                isValid = true;
            } else {
                isValid = /^-?\d*(\.\d+)?$/.test(val);
            }
        }

        if (!isValid) {
            container?.classList.add('error');
            if (errorMsgEl) {
                errorMsgEl.style.display = 'flex';
                if (window.lucide) lucide.createIcons();
            }
        } else {
            container?.classList.remove('error');
            if (errorMsgEl) errorMsgEl.style.display = 'none';
        }

        // Update value
        setValue(tabId, pKey, qKey, val);
    }

    /**
     * Initialize smart inputs after rendering (scroll sync)
     */
    function initSmartInputs() {
        document.querySelectorAll('.af-smart-text-input').forEach(input => {
            const backdropId = input.id.replace('af-input-', 'af-backdrop-');
            const backdrop = document.getElementById(backdropId);

            if (backdrop) {
                // Sync scroll on input scroll
                input.onscroll = () => {
                    backdrop.scrollLeft = input.scrollLeft;
                };

                // Initial render
                handleSmartInput(input);
            }
        });
    }

    /**
     * Smart Textarea handler - renders chips in backdrop with auto-resize
     * @param {HTMLTextAreaElement} textareaEl - The textarea element
     */
    function handleSmartTextarea(textareaEl) {
        const tabId = textareaEl.dataset.tab;
        const pKey = textareaEl.dataset.page;
        const qKey = textareaEl.dataset.question;
        const val = textareaEl.value;

        // Get the container and backdrop
        const container = textareaEl.closest('.af-smart-textarea-container');
        const actionType = container?.dataset.actionType || 'fill';
        const backdropId = textareaEl.id.replace('af-input-', 'af-backdrop-');
        const backdrop = document.getElementById(backdropId);

        // Auto-resize textarea and container
        textareaEl.style.height = 'auto';
        const newHeight = Math.max(60, textareaEl.scrollHeight);
        textareaEl.style.height = newHeight + 'px';
        if (container) container.style.height = newHeight + 'px';
        if (backdrop) backdrop.style.height = newHeight + 'px';

        // Render chips in backdrop
        if (backdrop) {
            backdrop.innerHTML = '';

            const headers = window.globalHeaders || [];
            const conceptTitles = (window.projectData?.tabs || [])
                .filter(t => t.type === 'concept' || (!t.type && t.content !== undefined))
                .map(t => t.title?.toLowerCase().trim())
                .filter(Boolean);

            let lastIndex = 0;
            const regex = /\{([^{}]+)\}|\[\[([^\[\]]+)\]\]/g;
            let match;

            while ((match = regex.exec(val)) !== null) {
                const textBefore = val.substring(lastIndex, match.index);
                if (textBefore) {
                    backdrop.appendChild(document.createTextNode(textBefore));
                }

                const chip = document.createElement('span');
                chip.className = 'af-input-chip';

                if (match[1] !== undefined) {
                    const cleanName = match[1].trim();
                    if (headers.length > 0) {
                        const isValidCol = headers.includes(cleanName);
                        chip.classList.add(isValidCol
                            ? (actionType === 'select' ? 'valid-select' : 'valid-fill')
                            : 'invalid'
                        );
                    } else {
                        chip.classList.add(actionType === 'select' ? 'valid-select' : 'valid-fill');
                    }
                } else if (match[2] !== undefined) {
                    const conceptName = match[2].trim().toLowerCase();
                    const isValidConcept = conceptTitles.includes(conceptName);
                    chip.classList.add(isValidConcept ? 'valid-concept' : 'invalid');
                }

                chip.textContent = match[0];
                backdrop.appendChild(chip);
                lastIndex = regex.lastIndex;
            }

            const textAfter = val.substring(lastIndex);
            if (textAfter) {
                backdrop.appendChild(document.createTextNode(textAfter));
            }

            // Sync scroll
            backdrop.scrollTop = textareaEl.scrollTop;
        }

        // Update value
        setValue(tabId, pKey, qKey, val);
    }

    /**
     * Initialize smart textareas after rendering
     */
    function initSmartTextareas() {
        document.querySelectorAll('.af-smart-textarea').forEach(textarea => {
            const backdropId = textarea.id.replace('af-input-', 'af-backdrop-');
            const backdrop = document.getElementById(backdropId);

            if (backdrop) {
                textarea.onscroll = () => {
                    backdrop.scrollTop = textarea.scrollTop;
                };

                // Initial render
                handleSmartTextarea(textarea);
            }
        });
    }

    function onRowSelected() {
        tabs.forEach((s, id) => {
            const v = document.querySelector(`#af-tog-view-${id}.${'active-view'}`);
            if (v) renderViewMode(id);
        });
    }

    // ============================================================
    // VIEW MODE - Complete Redesign with Flow Timeline
    // ============================================================

    /**
     * Get concept content by title (from template_view.js logic)
     */
    function getConceptContent(conceptTitle) {
        if (!conceptTitle || !window.projectData?.tabs) return null;
        const searchTitle = conceptTitle.toLowerCase().trim();
        const tab = window.projectData.tabs.find(t => {
            const isConceptType = t.type === 'concept' || t.type === undefined || !t.type;
            const titleMatches = t.title && t.title.toLowerCase().trim() === searchTitle;
            return isConceptType && titleMatches && t.content !== undefined;
        });
        if (!tab) return null;
        // Process column placeholders in concept content
        return tab.content.replace(/\{([^{}]+)\}/g, (match, key) => {
            const trimmedKey = key.trim();
            if (window.globalSelectedData && window.globalSelectedData[trimmedKey] !== undefined) {
                return window.globalSelectedData[trimmedKey];
            }
            return match;
        });
    }

    /**
     * Resolve all placeholders ({Column} and [[Concept]]) in a value
     */
    function resolveAllPlaceholders(text, selectedData) {
        if (!text) return '';
        let result = text;
        // First resolve [[Concept]] placeholders
        result = result.replace(/\[\[([^\[\]]+)\]\]/g, (match, name) => {
            const content = getConceptContent(name.trim());
            return content !== null ? content : match;
        });
        // Then resolve {Column} placeholders
        result = result.replace(/\{([^{}]+)\}/g, (match, col) => {
            const val = selectedData?.[col.trim()] ?? selectedData?.[col.trim().toLowerCase()];
            return val !== undefined && val !== '' ? val : match;
        });
        return result;
    }

    /**
     * Process text and generate HTML with chips for placeholders
     * - No row selected: indigo chip with placeholder name
     * - Row selected + value exists: blue/cyan chip with value
     * - Row selected + empty value: red chip with placeholder name + alert icon
     */
    function processTextWithChips(originalText, selectedData) {
        if (!originalText) return '<span class="afv-empty">—</span>';

        const hasRowSelected = selectedData && Object.keys(selectedData).length > 0;

        let result = '';
        let lastIndex = 0;

        // Combined regex to match both {column} and [[concept]]
        const combinedRegex = /\{([^{}]+)\}|\[\[([^\[\]]+)\]\]/g;
        let match;

        while ((match = combinedRegex.exec(originalText)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                result += escHtml(originalText.substring(lastIndex, match.index));
            }

            if (match[1] !== undefined) {
                // It's a {Column} placeholder
                const colName = match[1].trim();

                if (!hasRowSelected) {
                    // No row selected - show indigo chip with placeholder name
                    result += `<span class="afv-chip pending">{${escHtml(colName)}}</span>`;
                } else {
                    const val = selectedData?.[colName] ?? selectedData?.[colName.toLowerCase()];
                    if (val !== undefined && val !== '') {
                        // Resolved - show value in blue chip
                        result += `<span class="afv-chip column">${escHtml(val)}</span>`;
                    } else {
                        // Row selected but empty value - show placeholder name + alert
                        result += `<span class="afv-chip empty">{${escHtml(colName)}}<i data-lucide="alert-circle"></i></span>`;
                    }
                }
            } else if (match[2] !== undefined) {
                // It's a [[Concept]] placeholder
                const conceptName = match[2].trim();
                const content = getConceptContent(conceptName);

                if (!hasRowSelected) {
                    // No row selected - show indigo chip with placeholder name
                    result += `<span class="afv-chip pending">[[${escHtml(conceptName)}]]</span>`;
                } else if (content !== null && content !== '') {
                    // Resolved - show content in cyan chip
                    result += `<span class="afv-chip concept">${escHtml(content)}</span>`;
                } else {
                    // Row selected but concept not found/empty - show placeholder name + alert
                    result += `<span class="afv-chip empty">[[${escHtml(conceptName)}]]<i data-lucide="alert-circle"></i></span>`;
                }
            }

            lastIndex = combinedRegex.lastIndex;
        }

        // Add remaining text after last match
        if (lastIndex < originalText.length) {
            result += escHtml(originalText.substring(lastIndex));
        }

        return result || '<span class="afv-empty">—</span>';
    }

    /**
     * Resolve value considering mappings for select actions
     * Mapping structure: { optionValue: excelCellValue }
     * e.g., { "Cliente Premium": "Premium", "Cliente Regular": "Regular" }
     */
    function resolveValueWithMappings(question, selectedData) {
        const action = question.selenium?.action || 'fill';
        const isSelect = action === 'select' || question.type === 'choice';

        if (isSelect && question.config?.mapping?.enabled && question.config?.mapping?.placeholder) {
            // Get the column name from placeholder (remove { and })
            const placeholder = question.config.mapping.placeholder;
            const columnName = placeholder.replace(/^\{|\}$/g, '').trim();

            // Get the current row's value for this column
            const columnValue = selectedData?.[columnName] ?? selectedData?.[columnName.toLowerCase()];

            if (columnValue && question.config.mapping.map) {
                // Find which option has this column value mapped to it
                // The map is: { "Option A": "ExcelValue1", "Option B": "ExcelValue2" }
                for (const [optionValue, mappedExcelValue] of Object.entries(question.config.mapping.map)) {
                    if (mappedExcelValue === columnValue || String(mappedExcelValue) === String(columnValue)) {
                        return optionValue;
                    }
                }

                // No direct mapping found, check if there's a default value
                if (question.config.mapping.defaultValue) {
                    return question.config.mapping.defaultValue;
                }
            }
            return null; // No matching mapping found
        }

        // For fill actions, resolve placeholders in response
        return resolveAllPlaceholders(question.response || '', selectedData);
    }

    /**
     * Create page separator with orange border-title style
     */
    function createPageSeparator(page, index) {
        const separator = document.createElement('div');
        separator.className = 'afv-page-separator';

        const pageNum = index + 1;
        const sectionInfo = page.pageInfo ? ` — Sección ${page.pageInfo.current || '?'}/${page.pageInfo.total || '?'}` : '';

        separator.innerHTML = `<span class="afv-page-title">Página ${pageNum}${sectionInfo}</span>`;
        return separator;
    }

    /**
     * Create the flow grid container
     */
    function createFlowGrid() {
        const grid = document.createElement('div');
        grid.className = 'afv-flow-grid';
        return grid;
    }

    /**
     * Create a flow row with line segment + compact divided card for fill/select actions
     */
    function createViewFlowRow(question, actionNum, selectedData, isFirst, isLast, qKey) {
        const row = document.createElement('div');
        row.className = 'afv-flow-row';
        if (isFirst) row.classList.add('first');
        if (isLast) row.classList.add('last');

        const action = question.selenium?.action || 'fill';
        const isSelect = action === 'select' || question.type === 'choice';
        const actionType = isSelect ? 'select' : 'fill';
        const iconName = isSelect ? 'list' : 'type';
        const isLongText = question.config?.textType === 'long';

        // Extract question number from qKey (e.g., "q3" -> 3)
        const questionNum = parseInt((qKey || '').replace(/\D/g, ''), 10) || actionNum;

        // Resolve the final value
        const resolvedValue = resolveValueWithMappings(question, selectedData);

        // Build answer content based on type
        let answerHtml = '';

        if (isSelect && question.options?.length) {
            // Show all options with the selected one highlighted
            const isMapped = question.config?.mapping?.enabled;
            let selectedOptValue = resolvedValue;

            // If not mapped, use the stored response
            if (!isMapped) {
                selectedOptValue = question.response || '';
            }

            answerHtml = `<div class="afv-select-options">`;
            question.options.forEach(opt => {
                const optValue = opt.value || opt.text;
                const isSelected = optValue === selectedOptValue;
                answerHtml += `
                    <div class="afv-select-opt ${isSelected ? 'selected' : ''}">
                        <span class="afv-select-radio"></span>
                        <span>${escHtml(opt.text)}</span>
                    </div>
                `;
            });
            answerHtml += `</div>`;
        } else {
            // Fill action - show the response with chips for placeholders
            const originalText = question.response || '';
            const answerClass = isLongText ? 'afv-answer paragraph' : 'afv-answer';
            // Use processTextWithChips to render placeholders as colored chips
            const chipHtml = processTextWithChips(originalText, selectedData);
            answerHtml = `<div class="${answerClass}">${chipHtml}</div>`;
        }

        row.innerHTML = `
            <div class="afv-flow-line">
                <div class="afv-flow-num ${actionType}">${actionNum}</div>
            </div>
            <div class="afv-card ${actionType}">
                <div class="afv-card-accent ${actionType}">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="afv-card-content">
                    <div class="afv-question"><span class="afv-q-num">${questionNum}.</span> ${escHtml(question.text || 'Sin pregunta')}</div>
                    ${answerHtml}
                </div>
            </div>
        `;

        return row;
    }

    /**
     * Create a flow row for click/navigation actions
     */
    function createViewClickRow(label, navObj, actionNum, isFirst, isLast) {
        const row = document.createElement('div');
        row.className = 'afv-flow-row';
        if (isFirst) row.classList.add('first');
        if (isLast) row.classList.add('last');

        row.innerHTML = `
            <div class="afv-flow-line">
                <div class="afv-flow-num click">${actionNum}</div>
            </div>
            <div class="afv-card click">
                <div class="afv-card-accent click">
                    <i data-lucide="mouse-pointer-click"></i>
                </div>
                <div class="afv-card-content">
                    <div class="afv-question">${escHtml(label)}</div>
                </div>
            </div>
        `;

        return row;
    }

    /**
     * Main render function for the new View Mode
     * Uses a single grid for ALL pages so the line connects everything
     */
    function renderViewMode(tabId) {
        const state = tabs.get(tabId);
        const viewModeContainer = document.getElementById(`af-view-${tabId}`);
        const scrollContainer = document.getElementById(`af-container-view-${tabId}`);
        if (!viewModeContainer || !scrollContainer || !state.formData) return;

        // Clear scroll container only
        scrollContainer.innerHTML = '';

        const selectedData = window.globalSelectedData || {};
        const pages = state.formData.pages || {};
        const sortedPages = getSortedPages(pages);

        // Count total actions across ALL pages for global first/last
        let totalGlobalActions = 0;
        sortedPages.forEach(pKey => {
            const page = pages[pKey];
            const questions = Object.keys(page.questions || {});
            const nav = page.navigation || {};
            totalGlobalActions += questions.length;
            if (nav.next) totalGlobalActions++;
            if (nav.submit) totalGlobalActions++;
        });

        // === VIEW MODE HEADER (URL + Player) - prepend to view-mode ===
        // Remove existing if re-rendering
        const existingHeader = viewModeContainer.querySelector('.afv-view-header');
        if (existingHeader) existingHeader.remove();

        const viewHeader = document.createElement('div');
        viewHeader.className = 'afv-view-header';
        viewHeader.innerHTML = `
            <!-- Single Control Row: URL | Player | Status | Config -->
            <div class="afv-control-row">
                <i data-lucide="link" class="afv-url-ico"></i>
                <input type="text" class="afv-url-input" value="${escHtml(state.formData.url || 'Sin URL')}" readonly title="${escHtml(state.formData.url || '')}">
                <button class="afv-url-open" onclick="window.open('${escHtml(state.formData.url || '')}', '_blank')" title="Abrir" ${!state.formData.url ? 'disabled' : ''}>
                    <i data-lucide="external-link"></i>
                </button>
                <span class="afv-sep">|</span>
                <div class="afv-player-box">
                    <span class="afv-count-current" id="afv-current-${tabId}">0</span>
                    <span class="afv-count-sep">/</span>
                    <span class="afv-count-total" id="afv-total-${tabId}">${totalGlobalActions}</span>
                    <button class="afv-pbtn play" id="afv-play-${tabId}" title="Iniciar"><i data-lucide="play"></i></button>
                    <button class="afv-pbtn pause" id="afv-pause-${tabId}" title="Pausar" disabled><i data-lucide="pause"></i></button>
                    <button class="afv-pbtn stop" id="afv-stop-${tabId}" title="Detener" disabled><i data-lucide="square"></i></button>
                </div>
                <span class="afv-sep">|</span>
                <span class="afv-status" id="afv-status-${tabId}">Listo</span>
                <div class="afv-spacer"></div>
                <span class="afv-sep">|</span>
                <button class="afv-cfg-btn" id="afv-config-${tabId}" title="Configuración"><i data-lucide="settings"></i></button>
            </div>
        `;
        // Insert at beginning of view-mode (before scroll container)
        viewModeContainer.insertBefore(viewHeader, scrollContainer);

        // Create a SINGLE grid for all pages inside scroll container
        const gridContainer = createFlowGrid();
        scrollContainer.appendChild(gridContainer);

        let globalActionIndex = 0;

        sortedPages.forEach((pKey, pageIndex) => {
            const page = pages[pKey];

            // Add page separator as a grid row
            const sepRow = document.createElement('div');
            sepRow.className = 'afv-flow-row separator';
            sepRow.innerHTML = `
                <div class="afv-flow-line">
                    <div class="afv-flow-line-segment"></div>
                </div>
                <div class="afv-page-label">
                    <span>Página ${pageIndex + 1}${page.pageInfo ? ` — ${page.pageInfo.current || '?'}/${page.pageInfo.total || '?'}` : ''}</span>
                </div>
            `;
            gridContainer.appendChild(sepRow);

            // Render question cards
            const questions = getSortedQuestions(page.questions || {});
            const nav = page.navigation || {};

            questions.forEach(qKey => {
                globalActionIndex++;
                const isFirst = globalActionIndex === 1;
                const isLast = globalActionIndex === totalGlobalActions;
                const flowRow = createViewFlowRow(
                    page.questions[qKey],
                    globalActionIndex,
                    selectedData,
                    isFirst,
                    isLast,
                    qKey
                );
                gridContainer.appendChild(flowRow);
            });

            // Render navigation actions
            if (nav.next) {
                globalActionIndex++;
                const isFirst = globalActionIndex === 1;
                const isLast = globalActionIndex === totalGlobalActions;
                gridContainer.appendChild(createViewClickRow('Siguiente', nav.next, globalActionIndex, isFirst, isLast));
            }
            if (nav.submit) {
                globalActionIndex++;
                const isFirst = globalActionIndex === 1;
                const isLast = globalActionIndex === totalGlobalActions;
                gridContainer.appendChild(createViewClickRow('Enviar', nav.submit, globalActionIndex, isFirst, isLast));
            }
        });


        if (window.lucide) lucide.createIcons();
    }

    // Keep renderPreview as alias for backwards compatibility
    function renderPreview(tabId) {
        renderViewMode(tabId);
    }

    function getTabData(id) { return tabs.get(id); }
    function restoreTabData() { }

    // ============================================================
    // EVENT LISTENERS FOR BACKEND RECORDING EVENTS
    // ============================================================

    /**
     * Initialize event listeners for recording system
     */
    function initRecordingEvents() {
        // Listen for browser closed externally
        window.addEventListener('recording_browser_closed', (e) => {
            console.log('[AutoForm] Browser closed externally event received');
            // Find the tab that was recording
            const recordingTab = Array.from(tabs.entries()).find(([id, state]) => state.isRecording);
            if (recordingTab) {
                const [tabId] = recordingTab;
                stopRecording(tabId, true, true); // skipConfirm=true, browserClosed=true
            }
        });

        // Listen for recording stopped from injected UI
        window.addEventListener('recording_stopped', (e) => {
            console.log('[AutoForm] Recording stopped event received:', e.detail);
            const detail = e.detail || {};

            // Find the tab that was recording
            const recordingTab = Array.from(tabs.entries()).find(([id, state]) => state.isRecording);
            if (recordingTab) {
                const [tabId] = recordingTab;
                const tab = window.findTab ? window.findTab(tabId) : null;

                if (tab) {
                    tab.isRecording = false;
                    tab.isLoadingRecording = detail.path ? true : false;

                    renderInfoBar(tabId);

                    if (detail.path) {
                        // Recording was saved - load it
                        handleLoadRecording(detail.path, null).then(() => {
                            window.showAlert({
                                icon: 'check-circle',
                                iconColor: 'text-green-500',
                                title: 'Grabación Guardada',
                                message: 'La grabación se ha guardado y cargado correctamente.',
                                confirmText: 'Aceptar',
                                confirmColor: 'bg-green-600 hover:bg-green-700'
                            });
                        });
                    } else {
                        // Recording was not saved
                        const contentContainer = document.getElementById(`af-container-edit-${tabId}`);
                        if (contentContainer) {
                            contentContainer.innerHTML = renderEmptyState(tabId);
                            if (window.lucide) lucide.createIcons();
                        }

                        window.showAlert({
                            icon: 'info',
                            iconColor: 'text-blue-500',
                            title: 'Grabación Descartada',
                            message: 'La grabación se ha detenido sin guardar.',
                            confirmText: 'Aceptar',
                            confirmColor: 'bg-blue-600 hover:bg-blue-700'
                        });
                    }
                }
            }
        });

        console.log('[AutoForm] Recording event listeners initialized');
    }

    // Auto-initialize when module loads
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initRecordingEvents);
        } else {
            initRecordingEvents();
        }
    }

    return {
        createAutoFormContent,
        onRowSelected,
        getTabData, restoreTabData,
        openFileManager, setValue, setOption, updateUrl, openUrl,
        syncToProjectData, handleInputWithValidation, handleSmartInput, initSmartInputs,
        handleSmartTextarea, initSmartTextareas,
        // Recording Manager
        openRecordingManager,
        closeRecordingManager,
        loadRecording,
        exportRecording,
        deleteRecording,
        importExternalRecording,
        // Advanced Config
        openAdvancedConfigModal,
        closeAdvancedConfigModal,
        // New Recording Modal
        openNewRecordingModal,
        closeNewRecordingModal,
        startNewRecording,
        stopRecording,
        toggleDebugMode,
        // Events
        initRecordingEvents
    };
})();

window.AutoFormViewModule = AutoFormViewModule;
