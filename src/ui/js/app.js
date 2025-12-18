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
        excel: null
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
        if (existing) existing.remove();

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'modal-alert-reusable';
        modal.className = 'modal-overlay open';

        modal.innerHTML = `
            <div class="modal-box" style="max-width: 400px;">
                <div class="flex items-start gap-4 mb-4">
                    <div class="flex-shrink-0 p-2 rounded-full bg-gray-100">
                        <i data-lucide="${icon}" class="w-6 h-6 ${iconColor}"></i>
                    </div>
                    <div class="flex-1">
                        <h3 class="text-lg font-bold text-gray-800 mb-2">${title}</h3>
                        <p class="text-sm text-gray-600">${message}</p>
                    </div>
                </div>
                <div class="flex justify-end gap-3">
                    ${cancelText ? `
                        <button id="alert-cancel-btn" class="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
                            ${cancelText}
                        </button>
                    ` : ''}
                    <button id="alert-confirm-btn" class="px-4 py-2 text-sm text-white rounded shadow-sm ${confirmColor}">
                        ${confirmText}
                    </button>
                </div>
            </div>
        `;

        // Event handlers
        const closeModal = () => {
            modal.classList.remove('open');
            setTimeout(() => modal.remove(), 200);
        };

        modal.querySelector('#alert-confirm-btn').onclick = () => {
            closeModal();
            if (onConfirm) onConfirm();
        };

        const cancelBtn = modal.querySelector('#alert-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeModal();
                if (onCancel) onCancel();
            };
        }

        // Close on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
                if (onCancel) onCancel();
            }
        };

        document.body.appendChild(modal);
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
            name: window.projectData?.name || 'Mi Proyecto',
            excel: excel,
            forms: window.projectData?.forms || [],
            tabs: window.projectData?.tabs || [],
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
            const icons = { saving: '⏳', saved: '✓', restoring: '↻', error: '⚠' };
            footerEl.textContent = `${icons[status] || '✓'} ${text}`;
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
        updateSaveStatus('saving', 'Guardando...');

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
                    updateSaveStatus('saved', 'Restored');
                    console.log('[App] Project restored');
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

        // Restore projectData object
        window.projectData.name = data.name || 'Mi Proyecto';
        window.projectData.tabs = data.tabs || [];
        window.projectData.forms = data.forms || [];
        window.projectData.excel = data.excel || null;

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

        // Restore tabs (TemplateViewModule handles this)
        if (data.tabs && data.tabs.length > 0 && window.TemplateViewModule) {
            window.TemplateViewModule.restoreTabs(data.tabs, data.ui?.activeTab);
        }
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
        document.querySelectorAll('.modal-overlay').forEach(m => {
            m.classList.remove('open');
        });
    };

    // Click outside modal to close
    document.querySelectorAll('.modal-overlay').forEach(modal => {
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
            if (modal) {
                modal.classList.add('open');
                if (window.lucide) lucide.createIcons();
            }
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

})();
