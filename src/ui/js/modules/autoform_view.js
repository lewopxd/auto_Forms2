/**
 * AutoForm View Module - Phase 20 Fixes
 * Restore Action Icons (Fill/Select/Click)
 */
const AutoFormViewModule = (function () {
    'use strict';

    const tabs = new Map();

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
                        <div class="af-toggle-item active-edit" id="af-tog-edit-${tabId}">
                            <i data-lucide="edit-3"></i> Editar
                        </div>
                        <div class="af-toggle-item" id="af-tog-view-${tabId}">
                            <i data-lucide="eye"></i> Vista
                        </div>
                    </div>
                </div>
            </div>

            <!-- INFO BAR: Grabación (siempre) | URL (solo con archivo) -->
            <div class="af-info-bar" id="af-info-bar-${tabId}">
                <!-- Recording Section (siempre visible) -->
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
                
                <!-- Divider (solo con archivo) -->
                <div class="af-info-divider" id="af-divider-${tabId}" style="display:${state.formData ? 'block' : 'none'}"></div>
                
                <!-- URL Section (solo visible cuando hay archivo cargado, readonly input) -->
                <div class="af-info-url" id="af-url-section-${tabId}" style="display:${state.formData ? 'flex' : 'none'}">
                    <i data-lucide="link"></i>
                    <input type="text" class="af-url-input" id="af-url-text-${tabId}" 
                           value="${escHtml(state.formData?.url || '')}" 
                           readonly title="${escHtml(state.formData?.url || '')}">
                    <button class="af-url-open" title="Abrir URL" onclick="AutoFormViewModule.openUrl('${tabId}')">
                        <i data-lucide="external-link"></i>
                    </button>
                </div>
            </div>

            <!-- MAIN BODY -->
            <div class="form-body" style="flex: 1; position: relative; overflow: hidden; min-height: 0;">
                
                <!-- EDIT MODE VIEW -->
                <div class="edit-mode" id="af-edit-${tabId}" 
                     style="position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden;">
                    <div class="af-content-scroll" id="af-container-edit-${tabId}">
                        ${renderEmptyState()}
                    </div>
                </div>

                <!-- PREVIEW MODE VIEW -->
                <div class="view-mode" id="af-view-${tabId}" 
                     style="position:absolute; inset:0; display:none; flex-direction:column; overflow:hidden; background:white;">
                    <div class="af-content-scroll" id="af-container-view-${tabId}" style="background:white;"></div>
                </div>

            </div>
        `;

        setTimeout(() => {
            setupToggleEvents(tabId, root);
            root.querySelector(`#af-btn-open-${tabId}`).onclick = () => openRecordingManager(tabId);

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

    function renderEmptyState() {
        return `
            <div style="text-align:center;color:#9ca3af;margin-top:40px;">
                <p>Carga un archivo .raf para comenzar</p>
            </div>
        `;
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
                    <!-- Future: New Rec -->
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
    // 2. TOGGLE EVENTS
    // ============================================================

    function setupToggleEvents(tabId, root) {
        const btnEdit = root.querySelector(`#af-tog-edit-${tabId}`);
        const btnView = root.querySelector(`#af-tog-view-${tabId}`);
        const editDiv = root.querySelector(`#af-edit-${tabId}`);
        const viewDiv = root.querySelector(`#af-view-${tabId}`);

        const setMode = (isEdit) => {
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
                renderPreview(tabId);
            }
            if (window.lucide) lucide.createIcons();

            // Persist mode change
            syncToProjectData(tabId);
        };

        btnEdit.onclick = () => setMode(true);
        btnView.onclick = () => setMode(false);
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
    }

    function createCard(tabId, pKey, qKey, q, num, isViewMode, selectedData = {}) {
        const card = document.createElement('div');
        const action = q.selenium?.action || 'fill';
        const type = q.type || 'text';
        const isSelect = action === 'select' || type === 'choice';

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
                    <button class="af-settings-btn" style="border:none;background:transparent;color:#9ca3af;cursor:pointer;padding:4px" 
                            title="Configurar Acción" id="af-btn-cfg-${tabId}-${pKey}-${qKey}">
                        <i data-lucide="settings-2" style="width:14px"></i>
                        ${q.config ? '<span style="display:inline-block;width:6px;height:6px;background:#f97316;border-radius:50%;position:absolute;top:4px;right:4px"></span>' : ''}
                    </button>
                 ` : ''}
            </div>
        `;

        // BODY
        // BODY WRAPPER
        bodyHtml += `<div class="af-card-body">`;

        bodyHtml += `<div class="af-question-title">${q.text || 'Sin texto'}</div>`;

        const rawVal = q.response || '';
        const displayVal = isViewMode ? processPlaceholders(rawVal, selectedData) : rawVal;

        if (isSelect && q.options?.length) {
            bodyHtml += `<div class="af-opts">`;
            q.options.forEach(opt => {
                const val = opt.value || opt.text;
                const isSelected = rawVal === val;
                let itemClass = 'af-opt';
                if (isSelected) itemClass += ' selected';

                const clickAttr = !isViewMode
                    ? `onclick="AutoFormViewModule.setOption('${tabId}','${pKey}','${qKey}','${escJs(val)}')"`
                    : '';

                bodyHtml += `
                    <div class="${itemClass}" ${clickAttr}>
                        <div class="af-radio"></div>
                        <span>${opt.text}</span>
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
                bodyHtml += `
                    <input type="text" class="af-input" 
                           value="${escHtml(rawVal)}" 
                           placeholder="${inputType === 'number' ? '123 o {Columna}' : '{Columna} o valor fijo'}"
                           oninput="AutoFormViewModule.handleInputWithValidation(this, '${tabId}','${pKey}','${qKey}', '${inputType}')">
                `;
            }
        }

        bodyHtml += `</div>`; // End Body Wrapper

        // FOOTER
        bodyHtml += `<div class="af-card-footer" style="display:flex;justify-content:space-between;align-items:center;min-height:20px;">`;
        bodyHtml += `
            <div class="af-error-msg" style="display:none;align-items:center;color:#ef4444;font-size:11px;gap:4px;">
                <i data-lucide="alert-circle" style="width:14px;height:14px"></i>
                <span>Debe ser un número</span>
            </div>
        `;
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
                 <button class="af-settings-btn" style="border:none;background:transparent;color:#9ca3af;cursor:pointer;padding:4px" 
                            title="Configurar Navegación" id="${cardId}">
                        <i data-lucide="settings-2" style="width:14px"></i>
                        ${navObj.config ? '<span style="display:inline-block;width:6px;height:6px;background:#f97316;border-radius:50%;position:absolute;top:4px;right:4px"></span>' : ''}
                </button>
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

    function onRowSelected() {
        tabs.forEach((s, id) => {
            const v = document.querySelector(`#af-tog-view-${id}.${'active-view'}`);
            if (v) renderPreview(id);
        });
    }

    function renderPreview(tabId) {
        const state = tabs.get(tabId);
        const container = document.getElementById(`af-container-view-${tabId}`);
        if (!container || !state.formData) return;

        container.innerHTML = '';
        const selectedData = window.globalSelectedData || {};
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
            const seqPageNum = index + 1;

            sectionCard.innerHTML = `
            <div class="af-section-header">
                <div style="display:flex;align-items:center;">
                    <span style="font-size:13px;font-weight:700;">PÁGINA ${seqPageNum}</span>
                </div>
                <span class="af-section-chip">SECCIÓN ${pCurrent}/${pTotal}</span>
            </div>
            <div class="questions-container" id="af-pv-body-${pKey}"></div>
        `;
            container.appendChild(sectionCard);
            const pageBody = sectionCard.querySelector(`#af-pv-body-${pKey}`);

            getSortedQuestions(page.questions || {}).forEach(qKey => {
                globalActionIndex++;
                pageBody.appendChild(createCard(tabId, pKey, qKey, page.questions[qKey], globalActionIndex, true, selectedData));
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
    }

    function getTabData(id) { return tabs.get(id); }
    function restoreTabData() { }

    return {
        createAutoFormContent,
        onRowSelected,
        getTabData, restoreTabData,
        openFileManager, setValue, setOption, updateUrl, openUrl,
        syncToProjectData, handleInputWithValidation,
        // Recording Manager
        openRecordingManager,
        closeRecordingManager,
        loadRecording,
        exportRecording,
        deleteRecording,
        importExternalRecording
    };
})();

window.AutoFormViewModule = AutoFormViewModule;
