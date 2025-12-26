/**
 * FormFlow App - Main Application Logic
 * Handles splitter, modals, and global state
 */
(function () {
    'use strict';

    // === GLOBAL STATE ===
    window.globalSelectedData = null;
    window.globalHeaders = [];
    window.globalExcelData = null;
    window.projectData = {
        tabs: [],
        excel: null,
        recordings: [],  // Global recordings pool (not per-tab)
        variables: [],   // Computed variables with transformations
        settings: {      // Application settings (per-project)
            normalization: {
                enabled: true,
                flags: {
                    trim: true,
                    collapse: true,
                    lowercase: true,
                    accents: true
                }
            }
        },
        defaultActionSettings: {
            fill: {
                timing: { preDelay: 0, randomize: false, minDelay: 0, maxDelay: 100 },
                validation: { verifyContent: false },
                strategy: { type: 'native', typingSpeed: 50 },
                textType: 'short'
            },
            select: {
                timing: { preDelay: 0, randomize: false, minDelay: 0, maxDelay: 100 },
                validation: { verifyContent: false },
                strategy: { type: 'native' },
                mapping: { enabled: false, placeholder: '', map: {} }
            },
            click: {
                timing: { preDelay: 0, randomize: false, minDelay: 0, maxDelay: 100 }
            }
        },

        // === USER SAVE TRACKING ===
        currentProjectPath: null,  // Path where user saved/opened the project
        lastSavedHash: null        // Hash of project state at last user save
    };

    // === HELPERS ===

    window.findTab = function (id) {
        return window.projectData.tabs.find(t => t.id === id);
    };

    window.updateTab = function (id, changes) {
        const tab = window.findTab(id);
        if (tab) {
            Object.assign(tab, changes);
            window.triggerAutoSave();
        }
    };

    // === HASH UTILITIES FOR DIRTY STATE DETECTION ===

    /**
     * Stable JSON serialization with sorted keys for consistent hashing
     */
    function stableStringify(obj) {
        if (obj === null || typeof obj !== 'object') {
            return JSON.stringify(obj);
        }
        if (Array.isArray(obj)) {
            return '[' + obj.map(stableStringify).join(',') + ']';
        }
        const keys = Object.keys(obj).sort();
        const pairs = keys.map(key =>
            JSON.stringify(key) + ':' + stableStringify(obj[key])
        );
        return '{' + pairs.join(',') + '}';
    }

    /**
     * cyrb53 hash - 53-bit hash with very low collision probability
     */
    function cyrb53(str, seed = 0) {
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
        h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    }

    /**
     * Compute hash of project content (excluding volatile UI state)
     */
    function computeProjectHash() {
        const data = collectProjectData();
        const hashableData = {
            name: data.name,
            excel: data.excel,
            forms: data.forms,
            tabs: data.tabs,
            recordings: data.recordings,
            variables: data.variables,
            settings: data.settings
            // Excluded: ui (splitterPosition, activeTab) - volatile state
        };
        return cyrb53(stableStringify(hashableData)).toString(16);
    }

    /**
     * Check if there are unsaved changes compared to last user save
     */
    function hasUnsavedChanges() {
        // Never saved manually - check if there's any content
        if (!window.projectData.lastSavedHash) {
            const data = collectProjectData();
            return (data.tabs?.length > 0) ||
                (data.excel != null) ||
                (data.recordings?.length > 0);
        }
        // Compare current hash with saved hash
        return computeProjectHash() !== window.projectData.lastSavedHash;
    }

    // Expose for external use
    window.hasUnsavedChanges = hasUnsavedChanges;

    /**
     * Update the pywebview window title and footer indicator
     * @param {string} projectName - Name of the project file (optional)
     */
    function updateWindowTitle(projectName) {
        const baseName = 'AutoForms';
        let windowTitle = baseName;
        let footerText = 'Sin proyecto';

        if (projectName) {
            // Remove extension if present
            const displayName = projectName.replace(/\.afp$/i, '');

            // Check if there are unsaved changes using hash comparison
            const hasChanges = hasUnsavedChanges();
            const unsavedSuffix = hasChanges ? ' (SIN GUARDAR)' : '';

            windowTitle = `${displayName}${unsavedSuffix} — ${baseName}`;
            footerText = `${displayName}${unsavedSuffix}`;
        }

        // Update pywebview window title
        if (window.bridgePy?.setWindowTitle) {
            window.bridgePy.setWindowTitle(windowTitle);
        }

        // Update footer indicator (always visible)
        const footerIndicator = document.getElementById('project-name-indicator');
        if (footerIndicator) {
            footerIndicator.textContent = footerText;
        }
    }

    // Expose for external use
    window.updateWindowTitle = updateWindowTitle;

    // === REUSABLE ALERT MODAL ===

    /**
     * Show a customizable alert/confirmation modal
     * @param {Object} options
     * @param {string} options.icon - Lucide icon name (e.g., 'alert-triangle', 'trash-2', 'check-circle')
     * @param {string} options.iconColor - Tailwind color class (e.g., 'text-red-500', 'text-yellow-500')
     * @param {string} options.title - Modal title
     * @param {string} options.message - Modal message (can include HTML)
     * @param {string} options.confirmText - Confirm button text (default: 'Aceptar')
     * @param {string} options.cancelText - Cancel button text (default: 'Cancelar', null to hide)
     * @param {string} options.confirmColor - Confirm button color (default: 'bg-blue-600')
     * @param {Function} options.onConfirm - Callback when confirmed
     * @param {Function} options.onCancel - Callback when cancelled
     */
    window.showAlert = function (options = {}) {
        const {
            icon = 'alert-circle',
            iconColor = 'text-blue-500',
            title = 'Alerta',
            message = '',
            confirmText = 'Aceptar',
            cancelText = 'Cancelar',
            confirmColor = 'bg-blue-600 hover:bg-blue-700',
            onConfirm = null,
            onCancel = null
        } = options;

        // Remove existing modal if any
        const existing = document.getElementById('modal-alert-reusable');
        if (existing) {
            if (window.ModalManager) window.ModalManager.closeModal(existing);
            else existing.remove();
        }

        // Create modal using UNIFIED WINDOW system
        const modal = document.createElement('div');
        modal.id = 'modal-alert-reusable';
        modal.className = 'af-modal-overlay';

        // Determine Accent
        // 'alert-triangle' -> orange/yellow
        // 'trash-2' -> red
        // 'check-circle' -> green
        // 'blue' -> blue
        let accent = 'accent-blue';
        if (icon === 'trash-2' || iconColor.includes('red')) accent = 'accent-red';
        else if (icon === 'alert-triangle' || iconColor.includes('orange') || iconColor.includes('yellow')) accent = 'accent-orange';
        else if (icon === 'check-circle' || iconColor.includes('green')) accent = 'accent-green';

        modal.innerHTML = `
            <div class="af-modal-window ${accent}" style="width: 400px;">
                <div class="af-window-header">
                    <div class="af-window-title">
                        <i data-lucide="${icon}" class="w-5 h-5 ${iconColor}"></i>
                        <span>${title}</span>
                    </div>
                    <div class="af-window-close" id="alert-close-x">
                        <i data-lucide="x" class="w-5 h-5"></i>
                    </div>
                </div>
                
                <div class="af-window-body">
                    <p class="text-sm text-gray-600">${message}</p>
                </div>
                
                <div class="af-window-footer">
                    ${cancelText ? `
                        <button id="alert-cancel-btn" class="af-btn-ghost">
                            ${cancelText}
                        </button>
                    ` : ''}
                    <button id="alert-confirm-btn" class="af-btn-primary ${confirmColor}">
                        ${confirmText}
                    </button>
                </div>
            </div>
        `;

        // Event handlers
        const closeModal = () => {
            if (window.ModalManager) window.ModalManager.closeModal(modal);
            else modal.remove();
        };

        modal.querySelector('#alert-confirm-btn').onclick = () => {
            closeModal();
            if (onConfirm) onConfirm();
        };

        modal.querySelector('#alert-close-x').onclick = () => {
            closeModal();
            if (onCancel) onCancel();
        };

        const cancelBtn = modal.querySelector('#alert-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeModal();
                if (onCancel) onCancel();
            };
        }

        // Close on backdrop click (if enabled) in Modeless we might allow clicking outside to ignore?
        // User said: "el diseño del alert esta horrible ... que sea mas parecido al modal que queremos"
        // Alerts usually block. But if we want "Unified", maybe it behaves like the others.
        // However, alerts are usually modal (blocking).
        // Let's keep it modeless visual but maybe logically blocking if needed?
        // Actually, let's treat it as a window.
        modal.onmousedown = (e) => {
            if (e.target === modal) {
                // Clicking outside closes it?
                // Standard alert behavior: usually yes or specific cancel.
                // Let's allow close on backdrop click for convenience.
                closeModal();
                if (onCancel) onCancel();
            }
        };

        document.body.appendChild(modal);

        // Draggable
        if (window.ModalManager) {
            const win = modal.querySelector('.af-modal-window');
            const header = modal.querySelector('.af-window-header');
            window.ModalManager.makeDraggable(win, header);
            window.ModalManager.openModal(modal);
        } else {
            modal.style.display = 'flex';
        }

        if (window.lucide) lucide.createIcons();

        return modal;
    };

    // === AUTOSAVE SYSTEM ===
    let autosaveTimeout = null;
    const AUTOSAVE_DELAY = 2000; // 2 seconds debounce

    /**
     * Collect all project data for saving (sheetPlayground format)
     */
    function collectProjectData() {
        const excel = window.projectData?.excel ? {
            path: window.projectData.excel.path,
            filename: window.projectData.excel.filename,
            sheets: window.projectData.excel.sheets,
            activeSheet: window.projectData.excel.activeSheet,
            headers: window.projectData.excel.headers,
            rows: window.projectData.excel.rows,
            rowCount: window.projectData.excel.rowCount
        } : null;

        return {
            name: window.projectData?.name || 'Sin Título',
            currentProjectPath: window.projectData?.currentProjectPath || null,  // Persist user save path
            lastSavedHash: window.projectData?.lastSavedHash || null,  // Persist hash for dirty detection
            excel: excel,
            forms: window.projectData?.forms || [],
            tabs: window.projectData?.tabs || [],
            recordings: window.projectData?.recordings || [],  // Global recordings
            variables: window.projectData?.variables || [],    // Computed variables
            settings: window.projectData?.settings || {},      // Application settings
            ui: {
                splitterPosition: getSplitterPosition(),
                activeTab: getActiveTabId()
            }
        };
    }

    function getSplitterPosition() {
        const left = document.getElementById('left-panel');
        if (!left) return 50;
        const width = parseFloat(left.style.width);
        return isNaN(width) ? 50 : width;
    }

    function getActiveTabId() {
        const active = document.querySelector('.chrome-tab.active');
        return active ? active.dataset.id : null;
    }

    /**
     * Update footer save status (bottom right footer)
     */
    let lastSaveTime = null;

    function updateSaveStatus(status, text) {
        // Footer status element
        const footerEl = document.querySelector('.save-status');
        // Also update sidebar status for visibility
        const sidebarTextEl = document.getElementById('status-text');
        const sidebarIconEl = document.getElementById('status-icon');

        if (footerEl) {
            const icons = {
                saving: '<span class="spinner"></span>',
                saved: '✓',
                restoring: '↻',
                error: '⚠'
            };
            footerEl.innerHTML = `${icons[status] || '✓'} ${text}`;
        }

        if (sidebarTextEl) sidebarTextEl.textContent = text;
        if (sidebarIconEl) {
            const lucideIcons = { saving: 'loader', saved: 'check', restoring: 'refresh-cw', error: 'alert-circle' };
            sidebarIconEl.innerHTML = `<i data-lucide="${lucideIcons[status] || 'check'}" class="text-blue-400"></i>`;
            if (window.lucide) lucide.createIcons();
        }
    }

    function getTimeSinceLastSave() {
        if (!lastSaveTime) return '';
        const secs = Math.floor((Date.now() - lastSaveTime) / 1000);
        if (secs < 5) return 'just now';
        if (secs < 60) return `${secs}s ago`;
        const mins = Math.floor(secs / 60);
        return `${mins}m ago`;
    }

    /**
     * Trigger autosave with debounce
     */
    window.triggerAutoSave = function () {
        // Clear existing timeout
        clearTimeout(autosaveTimeout);

        // Show "saving" status immediately
        updateSaveStatus('saving', 'Saving...');

        // Debounce the actual save
        autosaveTimeout = setTimeout(async () => {
            if (!window.bridgePy || !window.bridgePy.isReady()) {
                console.warn('[App] Bridge not ready for autosave');
                updateSaveStatus('error', 'Sin conexión');
                return;
            }

            try {
                const data = collectProjectData();
                console.log('[App] Sending autosave...', Object.keys(data));

                const result = await bridgePy.send('autosave', data);
                console.log('[App] Autosave result:', result);

                if (result && result.success) {
                    lastSaveTime = Date.now();
                    updateSaveStatus('saved', 'Saved!');
                    console.log('[App] Autosaved:', result.timestamp);

                    // After 3s, show "Last saved X ago"
                    setTimeout(() => {
                        updateSaveStatus('saved', `Saved ${getTimeSinceLastSave()}`);
                    }, 3000);
                } else {
                    updateSaveStatus('error', 'Error');
                    console.error('[App] Autosave failed:', result?.error || 'Unknown error');
                }
            } catch (e) {
                console.error('[App] Autosave error:', e);
                updateSaveStatus('error', 'Error');
            }
        }, AUTOSAVE_DELAY);
    };

    /**
     * Check and restore autosave on startup
     */
    async function checkAndRestoreAutosave() {
        if (!window.bridgePy) return;

        try {
            updateSaveStatus('restoring', 'Verificando...');

            const check = await bridgePy.send('check_autosave', {});

            if (check.exists) {
                updateSaveStatus('restoring', 'Restoring project...');
                console.log('[App] Found autosave:', check.name);

                const load = await bridgePy.send('load_autosave', {});

                if (load.success && load.data) {
                    restoreProjectData(load.data);

                    // Update window title with project name (autosave has no user path)
                    const projectName = load.data.name || 'Mi Proyecto';
                    updateWindowTitle(projectName);

                    updateSaveStatus('saved', 'Restored');
                    console.log('[App] Project restored:', projectName);
                } else {
                    updateSaveStatus('saved', 'Listo');
                }
            } else {
                updateSaveStatus('saved', 'Listo');
            }
        } catch (e) {
            console.error('[App] Restore error:', e);
            updateSaveStatus('saved', 'Listo');
        }
    }

    /**
     * Restore project data to UI
     */
    function restoreProjectData(data) {
        console.log('[App] Restoring project data:', Object.keys(data));
        console.log('[App] Tabs count:', data.tabs?.length || 0);
        console.log('[App] Excel present:', !!data.excel);
        console.log('[App] Recordings count:', data.recordings?.length || 0);

        // FIRST: Clear existing UI before restoring new project
        clearProjectUI();

        // Restore projectData object
        window.projectData.name = data.name || 'Sin Título';
        window.projectData.currentProjectPath = data.currentProjectPath || null;  // Restore user save path
        window.projectData.lastSavedHash = data.lastSavedHash || null;  // Restore hash for dirty detection
        window.projectData.tabs = data.tabs || [];
        window.projectData.forms = data.forms || [];
        window.projectData.excel = data.excel || null;
        window.projectData.recordings = data.recordings || [];  // Restore global recordings
        window.projectData.variables = data.variables || [];    // Restore computed variables
        window.projectData.settings = data.settings || window.projectData.settings;  // Restore settings

        console.log('[App] projectData.tabs after restore:', window.projectData.tabs?.length);

        // Restore UI state
        if (data.ui?.splitterPosition) {
            const left = document.getElementById('left-panel');
            if (left) left.style.width = data.ui.splitterPosition + '%';
        }

        // Restore Excel if present - use bridge handler to restore cache
        if (data.excel && window.bridgePy) {
            console.log('[App] Restoring Excel...', data.excel.filename);

            // If we have cachedData, restore from cache (fast)
            if (data.excel.cachedData) {
                console.log('[App] Restoring from cache...');
                bridgePy.send('excel_restore_cache', { excel: data.excel }).then(result => {
                    if (result.success) {
                        console.log('[App] Excel cache restored');
                    } else {
                        console.error('[App] Excel cache restore failed:', result.error);
                    }
                }).catch(e => {
                    console.error('[App] Excel restore error:', e);
                });
            }
            // Otherwise, re-parse from file path if available
            else if (data.excel.path) {
                console.log('[App] Re-parsing from path:', data.excel.path);
                bridgePy.send('excel_parse', {
                    path: data.excel.path,
                    sheet: data.excel.activeSheet
                }).then(() => {
                    console.log('[App] Excel parse started');
                }).catch(e => {
                    console.error('[App] Excel parse error:', e);
                });
            }
        }

        // Restore tabs (TemplateViewModule handles this) - ALWAYS call, even if empty
        if (window.TemplateViewModule?.restoreTabs) {
            const tabs = data.tabs || [];
            console.log('[App] Calling TemplateViewModule.restoreTabs with', tabs.length, 'tabs');
            window.TemplateViewModule.restoreTabs(tabs, data.ui?.activeTab);
        }
    }

    /**
     * Clear current project UI (used when opening/creating new project)
     */
    function clearProjectUI() {
        // Clear global state
        window.globalSelectedData = null;
        window.globalHeaders = [];
        window.globalExcelData = null;

        // Clear Excel viewer
        const emptyState = document.getElementById('empty-state');
        const gridWrapper = document.getElementById('grid-wrapper');
        const sheetTabs = document.getElementById('sheet-tabs');
        const fileName = document.getElementById('file-name');

        if (emptyState) emptyState.classList.remove('hidden');
        if (gridWrapper) {
            gridWrapper.classList.add('hidden');
            gridWrapper.innerHTML = '';
        }
        if (sheetTabs) {
            sheetTabs.classList.add('hidden');
            sheetTabs.innerHTML = '';
        }
        if (fileName) fileName.textContent = '';

        // Update footer info
        const excelInfo = document.querySelector('.excel-info');
        if (excelInfo) excelInfo.textContent = 'Sin Excel';

        console.log('[App] Project UI cleared');
    }

    // === SPLITTER LOGIC ===
    const resizer = document.getElementById('resizer');
    const leftPanel = document.getElementById('left-panel');
    const container = document.getElementById('app-container');
    let isResizing = false;

    if (resizer && leftPanel && container) {
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.classList.add('noselect');
            resizer.classList.add('resizing');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const containerRect = container.getBoundingClientRect();
            let newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
            newWidth = Math.max(20, Math.min(80, newWidth));
            leftPanel.style.width = newWidth + '%';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.classList.remove('noselect');
                resizer.classList.remove('resizing');
            }
        });
    }

    // === MODAL FUNCTIONS ===

    window.closeModals = function () {
        // Updated selector for unified architecture
        document.querySelectorAll('.af-modal-overlay, .modal-overlay').forEach(m => {
            if (window.ModalManager) {
                window.ModalManager.closeModal(m);
            } else {
                m.classList.remove('open');
                m.style.display = 'none';
            }
        });
    };

    // Click outside modal to close
    document.querySelectorAll('.af-modal-overlay, .modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                window.closeModals();
            }
        });
    });

    // ESC to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeModals();
        }
    });

    // === ADD TAB BUTTON ===
    const addTabBtn = document.getElementById('add-tab-btn');
    if (addTabBtn) {
        addTabBtn.addEventListener('click', () => {
            const modal = document.getElementById('modal-tab-type');
            if (modal && window.ModalManager) {
                // Use ModalManager for stacking
                const win = modal.querySelector('.af-modal-window');
                const header = modal.querySelector('.af-window-header');

                // Ensure draggable
                // Note: makeDraggable handles registration internally
                window.ModalManager.makeDraggable(win, header);

                window.ModalManager.openModal(modal);
            } else if (modal) {
                modal.classList.add('open');
            }
            if (window.lucide) lucide.createIcons();
        });
    }

    // === ROW SELECTION HANDLER ===
    if (window.bridgePy) {
        window.bridgePy.on('row_selected', (data) => {
            // Update global state
            // SheetView sends already mapped object {Col1: Val1...} plus metadata
            window.globalSelectedData = data || {};

            // Refresh all tab views
            document.querySelectorAll('.tab-content').forEach(content => {
                if (content.updateView) {
                    content.updateView();
                }
            });
        });
    }

    // === PROJECT SAVE/LOAD ===

    /**
     * Open a project file from disk
     */
    async function openProject() {
        try {
            const result = await window.bridgePy.send('open_project', {});

            if (result.cancelled) {
                // User cancelled dialog
                return;
            }

            if (!result.success) {
                window.showAlert({
                    icon: 'alert-circle',
                    iconColor: 'text-red-500',
                    title: 'Error al abrir',
                    message: result.error || 'No se pudo abrir el proyecto',
                    confirmText: 'Aceptar'
                });
                return;
            }

            // Restore project data
            restoreProjectData(result.data);

            // Update project name from filename (without extension)
            const projectName = result.filename.replace(/\.afp$/i, '');
            window.projectData.name = projectName;

            // Track user save state
            window.projectData.currentProjectPath = result.path;
            window.projectData.lastSavedHash = computeProjectHash();

            // Update window title to show project name
            updateWindowTitle(result.filename);

            // Show success notification
            window.showAlert({
                icon: 'check-circle',
                iconColor: 'text-green-500',
                title: 'Proyecto abierto',
                message: `Se cargó: ${result.filename}`,
                confirmText: 'Aceptar'
            });

        } catch (e) {
            console.error('[App] Open project error:', e);
            window.showAlert({
                icon: 'alert-circle',
                iconColor: 'text-red-500',
                title: 'Error',
                message: 'Error al abrir el proyecto: ' + e.message,
                confirmText: 'Aceptar'
            });
        }
    }

    /**
     * Save project to a user-selected file
     */
    async function saveProjectAs() {
        try {
            // Collect all project data
            const projectData = collectProjectData();

            const result = await window.bridgePy.send('save_project_as', { data: projectData });

            if (result.cancelled) {
                // User cancelled dialog
                return;
            }

            if (!result.success) {
                window.showAlert({
                    icon: 'alert-circle',
                    iconColor: 'text-red-500',
                    title: 'Error al guardar',
                    message: result.error || 'No se pudo guardar el proyecto',
                    confirmText: 'Aceptar'
                });
                return;
            }

            // Update project name from filename (without extension)
            const projectName = result.filename.replace(/\.afp$/i, '');
            window.projectData.name = projectName;

            // Track user save state
            window.projectData.currentProjectPath = result.path;
            window.projectData.lastSavedHash = computeProjectHash();

            // Update window title to show project name
            updateWindowTitle(result.filename);

            // Show success notification
            window.showAlert({
                icon: 'check-circle',
                iconColor: 'text-green-500',
                title: 'Proyecto guardado',
                message: `Guardado en: ${result.filename}`,
                confirmText: 'Aceptar'
            });

        } catch (e) {
            console.error('[App] Save project error:', e);
            window.showAlert({
                icon: 'alert-circle',
                iconColor: 'text-red-500',
                title: 'Error',
                message: 'Error al guardar el proyecto: ' + e.message,
                confirmText: 'Aceptar'
            });
        }
    }

    /**
     * Smart Save - saves to existing path or opens Save As dialog
     */
    async function saveProject() {
        if (window.projectData.currentProjectPath) {
            // Save directly to existing path
            try {
                const data = collectProjectData();
                const result = await window.bridgePy.send('save_project', {
                    path: window.projectData.currentProjectPath,
                    data: data
                });

                if (result.success) {
                    window.projectData.lastSavedHash = computeProjectHash();

                    // Update window title to remove "(SIN GUARDAR)"
                    updateWindowTitle(window.projectData.name);

                    updateSaveStatus('saved', 'Guardado');

                    // Show visible notification to user
                    if (window.toast) {
                        const filename = window.projectData.currentProjectPath.split(/[/\\]/).pop();
                        window.toast.success('Proyecto guardado', filename);
                    }

                    console.log('[App] Project saved to:', result.path);
                } else {
                    window.showAlert({
                        icon: 'alert-circle',
                        iconColor: 'text-red-500',
                        title: 'Error al guardar',
                        message: result.error || 'No se pudo guardar',
                        confirmText: 'Aceptar'
                    });
                }
            } catch (e) {
                console.error('[App] Save project error:', e);
                window.showAlert({
                    icon: 'alert-circle',
                    iconColor: 'text-red-500',
                    title: 'Error',
                    message: 'Error al guardar: ' + e.message,
                    confirmText: 'Aceptar'
                });
            }
        } else {
            // No existing path, use Save As
            await saveProjectAs();
        }
    }

    /**
     * New Project - clears all state with confirmation if unsaved changes
     */
    async function newProject() {
        if (hasUnsavedChanges()) {
            window.showAlert({
                icon: 'alert-triangle',
                iconColor: 'text-orange-500',
                title: 'Cambios sin guardar',
                message: '¿Deseas guardar los cambios antes de crear un nuevo proyecto?',
                confirmText: 'Guardar',
                cancelText: 'Descartar',
                onConfirm: async () => {
                    await saveProject();
                    performNewProject();
                },
                onCancel: () => {
                    performNewProject();
                }
            });
        } else {
            performNewProject();
        }
    }

    /**
     * Actually reset the project state
     */
    function performNewProject() {
        // Reset project data
        window.projectData.tabs = [];
        window.projectData.excel = null;
        window.projectData.recordings = [];
        window.projectData.variables = [];
        window.projectData.forms = [];
        window.projectData.name = 'Sin Título';
        window.projectData.currentProjectPath = null;
        window.projectData.lastSavedHash = null;

        // Clear UI (reuse existing function)
        clearProjectUI();

        // Clear tabs UI (restoreTabs handles reset internally)
        if (window.TemplateViewModule?.restoreTabs) {
            window.TemplateViewModule.restoreTabs([], null);
        }

        // Clear autosave
        if (window.bridgePy) {
            window.bridgePy.send('clear_autosave', {});
        }

        // Reset window title
        updateWindowTitle(null);

        updateSaveStatus('saved', 'Nuevo proyecto');
        console.log('[App] New project created');
    }

    // Setup project button handlers
    const btnOpenProject = document.getElementById('btn-open-project');
    const btnSaveProject = document.getElementById('btn-save-project');
    const btnSaveAsProject = document.getElementById('btn-save-as-project');
    const btnNewProject = document.getElementById('btn-new-project');
    const btnOpenVariables = document.getElementById('btn-open-variables');
    const btnProjectSettings = document.getElementById('btn-project-settings');

    if (btnOpenProject) {
        btnOpenProject.addEventListener('click', openProject);
    }
    if (btnSaveProject) {
        btnSaveProject.addEventListener('click', saveProject);  // Smart save
    }
    if (btnSaveAsProject) {
        btnSaveAsProject.addEventListener('click', saveProjectAs);  // Always opens dialog
    }
    if (btnNewProject) {
        btnNewProject.addEventListener('click', newProject);  // With confirmation
    }
    if (btnOpenVariables) {
        btnOpenVariables.addEventListener('click', () => {
            if (window.VariablesModule) {
                window.VariablesModule.openModal();
            }
        });
    }
    if (btnProjectSettings) {
        btnProjectSettings.addEventListener('click', () => {
            if (window.ProjectSettingsModal) {
                window.ProjectSettingsModal.openModal();
            }
        });
    }

    // === KEYBOARD SHORTCUTS ===
    document.addEventListener('keydown', (e) => {
        // Ctrl+S = Save
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveProject();
        }
        // Ctrl+Shift+S = Save As
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault();
            saveProjectAs();
        }
        // Ctrl+N = New Project
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            newProject();
        }
        // Ctrl+O = Open Project
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            openProject();
        }
    });

    // === BEFOREUNLOAD - Warn on close with unsaved changes ===
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';  // Required for Chrome
            return '';  // Required for some browsers
        }
    });

    // === INITIALIZATION ===
    function init() {
        console.log('[App] Initializing FormFlow...');

        // Create Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

        // Wait for bridge to be ready
        if (window.bridgePy) {
            window.bridgePy.on('ready', () => {
                console.log('[App] Bridge ready');
                // Check and restore autosave
                checkAndRestoreAutosave();
            });
        }

        console.log('[App] Initialized');
    }

    // Execute when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // === DEEP RELOAD FUNCTION ===
    /**
     * Deep reload: clears all caches except localStorage, then hard reloads
     * More powerful than Shift+F5 but preserves user data
     */
    window.deepReload = function () {
        console.log('[App] Deep reload initiated...');

        // Clear sessionStorage
        try {
            sessionStorage.clear();
            console.log('[App] SessionStorage cleared');
        } catch (e) {
            console.warn('[App] Failed to clear sessionStorage:', e);
        }

        // Clear Cache API if available
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    caches.delete(name);
                    console.log('[App] Cache deleted:', name);
                });
            }).catch(e => {
                console.warn('[App] Failed to clear caches:', e);
            });
        }

        // Force hard reload after a tiny delay to let cache clearing complete
        setTimeout(() => {
            location.reload(true);
        }, 100);
    };

    // Setup deep reload button
    const deepReloadBtn = document.getElementById('deep-reload-btn');
    if (deepReloadBtn) {
        deepReloadBtn.addEventListener('click', window.deepReload);
    }

})();
