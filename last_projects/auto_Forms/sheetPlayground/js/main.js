/* =====================================
   MAIN.JS - Punto de Entrada Principal
   Versión Backend-Integrated (No localStorage)
   ===================================== */

(function () {
    'use strict';

    // === ESTADO GLOBAL ===
    window.globalSelectedData = null;
    window.globalHeaders = [];
    window.projectData = {
        id: null,
        name: null,
        tabs: [],
        excel: null,
        showCheckColumn: false,
        checkColumnData: {}
    };

    // === HELPERS GLOBALES ===

    /**
     * Busca un tab por ID
     */
    window.findTab = function (id) {
        return window.projectData.tabs.find(t => t.id === id);
    };

    /**
     * Actualiza un tab y dispara autosave
     */
    window.updateTab = function (id, changes) {
        const tab = window.findTab(id);
        if (!tab) return;
        Object.assign(tab, changes);
        window.triggerAutoSave();
    };

    /**
     * Trigger auto-save via BackendService
     */
    window.triggerAutoSave = function () {
        if (window.BackendService) {
            BackendService.triggerAutoSave();
        }
    };

    // === LÓGICA DEL SPLITTER ===
    const resizer = document.getElementById('resizer');
    const leftPanel = document.getElementById('left-panel');
    const container = document.getElementById('app-container');
    let isResizing = false;

    if (resizer) {
        resizer.addEventListener('mousedown', () => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            document.body.classList.add('noselect');
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (isResizing && leftPanel && container) {
            const containerRect = container.getBoundingClientRect();
            leftPanel.style.width = `${((e.clientX - containerRect.left) / containerRect.width) * 100}%`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            document.body.classList.remove('noselect');
            // Save splitter position
            window.triggerAutoSave();
        }
    });

    // === FUNCIONES DE ESTADO (UI status in task bar) ===

    function setStatus(status, text = '') {
        const iconContainer = document.getElementById('status-icon');
        const textEl = document.getElementById('status-text');

        if (textEl) textEl.textContent = text;

        if (iconContainer) {
            if (status === 'saving') {
                iconContainer.innerHTML = '<i data-lucide="loader-2" class="animate-spin text-blue-400"></i>';
            } else if (status === 'saved') {
                iconContainer.innerHTML = '<i data-lucide="check" class="text-blue-400"></i>';
            } else if (status === 'error') {
                iconContainer.innerHTML = '<i data-lucide="alert-circle" class="text-red-400"></i>';
            } else {
                iconContainer.innerHTML = '<i data-lucide="check" class="text-blue-400"></i>';
            }
            lucide.createIcons();
        }
    }

    // === PROYECTO: FUNCIONES (Desktop Style) ===

    /**
     * Crea un nuevo proyecto
     */
    window.createNewProject = async function () {
        const nameInput = document.getElementById('new-project-name');
        const name = nameInput ? nameInput.value.trim() : 'Mi Proyecto';

        if (!name) {
            alert('Por favor ingresa un nombre para el proyecto');
            return;
        }

        closeModals();

        // Reset local state
        window.globalSelectedData = null;
        window.globalHeaders = [];
        window.projectData = {
            id: null,
            name: name,
            tabs: [],
            excel: null,
            showCheckColumn: false,
            checkColumnData: {}
        };

        // Reset modules
        if (window.SheetViewModule) {
            window.SheetViewModule.reset();
        }
        if (window.TemplateViewModule) {
            window.TemplateViewModule.reset();
        }

        // Save As to choose location
        const result = await BackendService.saveAs();

        if (result) {
            setStatus('saved', 'Creado');
        }

        lucide.createIcons();
    };

    /**
     * Guardar proyecto (usa ruta actual o pide nueva)
     */
    window.saveProject = async function () {
        closeModals();
        await BackendService.save();
    };

    /**
     * Guardar Como (siempre pide ubicación)
     */
    window.saveProjectAs = async function () {
        closeModals();
        await BackendService.saveAs();
    };

    /**
     * Abrir proyecto (diálogo nativo)
     */
    window.openProjectDialog = async function () {
        closeModals();

        const data = await BackendService.openProjectDialog();

        if (data && !data.cancelled) {
            restoreProjectData(data);
        }
    };

    /**
     * Cargar proyecto de la lista de recientes
     */
    window.loadRecentProject = async function (path) {
        closeModals();

        const data = await BackendService.loadRecentProject(path);

        if (data) {
            restoreProjectData(data);
        }
    };

    /**
     * Restaura datos del proyecto en la UI
     */
    function restoreProjectData(data) {
        console.log('[Main] Restoring project:', data.name, data);

        // Restore project data to global state
        window.projectData = {
            id: data.id || null,
            name: data.name || 'Proyecto',
            tabs: Array.isArray(data.tabs) ? data.tabs : [],
            excel: data.excel || null,
            forms: data.forms || [],
            showCheckColumn: data.ui?.showCheckColumn || data.showCheckColumn || false,
            checkColumnData: data.checkColumnData || {}
        };

        // === UPDATE FOOTER ===
        const projectNameEl = document.querySelector('#status-footer .project-name');
        if (projectNameEl) {
            projectNameEl.textContent = window.projectData.name;
        }

        const excelInfoEl = document.querySelector('#status-footer .excel-info');
        if (excelInfoEl) {
            if (window.projectData.excel && window.projectData.excel.filename) {
                excelInfoEl.textContent = `${window.projectData.excel.filename} (${window.projectData.excel.rowCount || 0} filas)`;
            } else {
                excelInfoEl.textContent = 'Sin Excel';
            }
        }

        // Restore SheetView
        if (window.SheetViewModule && window.SheetViewModule.restoreConfig) {
            window.SheetViewModule.restoreConfig(window.projectData);
        }

        // Reset and restore template module
        if (window.TemplateViewModule) {
            window.TemplateViewModule.reset();
        }

        // Restore tabs
        if (window.projectData.tabs.length > 0) {
            window.projectData.tabs.forEach(tab => {
                if (window.TemplateViewModule && window.TemplateViewModule.restoreTab) {
                    window.TemplateViewModule.restoreTab(tab);
                }
            });
            document.getElementById('no-tabs-state')?.classList.add('hidden');
            const activeTabId = data.ui?.activeTab || window.projectData.tabs[0]?.id;
            if (activeTabId && window.TemplateViewModule && window.TemplateViewModule.activateTab) {
                window.TemplateViewModule.activateTab(activeTabId);
            }
        }

        // Restore Excel from saved data
        if (window.projectData.excel) {
            console.log('[Main] Restoring Excel:', window.projectData.excel.filename);

            if (window.projectData.excel.headers) {
                window.globalHeaders = window.projectData.excel.headers.map(h =>
                    typeof h === 'string' ? h : (h.name || h)
                );
            }

            if (window.SheetViewModule && window.SheetViewModule.loadFromData && window.projectData.excel.rows) {
                window.SheetViewModule.loadFromData(window.projectData.excel);
            }
        }

        // Restore splitter
        const leftPanelEl = document.getElementById('left-panel');
        if (data.ui?.splitterPosition && leftPanelEl) {
            leftPanelEl.style.width = `${data.ui.splitterPosition}%`;
        }

        lucide.createIcons();
        console.log('[Main] Project restored successfully');
    }

    // === FUNCIONES DE MODALES ===

    window.openNewProjectModal = function () {
        const nameInput = document.getElementById('new-project-name');
        if (nameInput) nameInput.value = 'Mi Proyecto';

        document.getElementById('modal-new').classList.add('open');
        lucide.createIcons();
    };

    window.openSaveModal = async function () {
        // Update current path display
        const pathInfo = document.getElementById('current-path-info');
        const pathText = document.getElementById('current-path-text');
        const saveBtn = document.getElementById('btn-save-current');
        const saveBtnSubtext = saveBtn?.querySelector('.text-xs');

        try {
            const state = await BackendService.getAppState();
            const currentPath = state.currentProjectPath;

            if (currentPath && pathInfo && pathText) {
                // Path exists - enable Guardar
                pathInfo.classList.remove('hidden');
                pathText.textContent = currentPath;
                pathText.title = currentPath;
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.classList.remove('opacity-50');
                }
                if (saveBtnSubtext) {
                    saveBtnSubtext.textContent = 'Guardar en la ubicación actual';
                }
            } else {
                // No path - disable Guardar
                if (pathInfo) pathInfo.classList.add('hidden');
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.classList.add('opacity-50');
                }
                if (saveBtnSubtext) {
                    saveBtnSubtext.textContent = 'Sin ubicación guardada';
                }
            }
        } catch (e) {
            console.error('Error getting app state:', e);
            if (pathInfo) pathInfo.classList.add('hidden');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.classList.add('opacity-50');
            }
        }

        document.getElementById('modal-save').classList.add('open');
        lucide.createIcons();
    };

    window.openLoadModal = async function () {
        const recentList = document.getElementById('recent-projects-list');

        if (recentList) {
            recentList.innerHTML = '<div class="text-xs text-gray-400 p-2">Cargando...</div>';

            try {
                const recent = await BackendService.getRecentProjects();

                if (recent.length === 0) {
                    recentList.innerHTML = '<div class="text-xs text-gray-400 p-2">No hay proyectos recientes</div>';
                } else {
                    recentList.innerHTML = recent.map(p => `
                        <button onclick="loadRecentProject('${p.path.replace(/\\/g, '\\\\')}')"
                            class="w-full text-left p-2 rounded hover:bg-gray-100 transition-colors flex items-center gap-2">
                            <i data-lucide="file" class="w-4 h-4 text-gray-400"></i>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm font-medium text-gray-700 truncate">${p.name}</div>
                                <div class="text-xs text-gray-400 truncate" title="${p.path}">${p.path}</div>
                            </div>
                        </button>
                    `).join('');
                    lucide.createIcons();
                }
            } catch (e) {
                recentList.innerHTML = '<div class="text-xs text-red-400 p-2">Error al cargar recientes</div>';
            }
        }

        document.getElementById('modal-load').classList.add('open');
        lucide.createIcons();
    };

    function closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    }
    window.closeModals = closeModals;

    // === BACKEND EVENT HANDLERS ===

    function setupBackendListeners() {
        // When project is loaded from backend
        BackendService.on('project_loaded', (data) => {
            console.log('[Main] Project loaded:', data.name);
            restoreProjectData(data);
        });

        // When Excel is loaded
        BackendService.on('excel_loaded', (data) => {
            console.log('[Main] Excel loaded:', data.filename);

            // Update global headers
            window.globalHeaders = data.headers.map(h => h.name);

            // Update sheet view with data
            if (window.SheetViewModule && window.SheetViewModule.loadFromData) {
                window.SheetViewModule.loadFromData(data);
            } else {
                // Fallback: store data for rendering
                window.excelData = data;
            }
        });

        // Connection status
        BackendService.on('connected', () => {
            setStatus('saved', 'Conectado');
        });

        BackendService.on('disconnected', () => {
            setStatus('error', 'Desconectado');
        });
    }

    // === INICIALIZACIÓN ===

    async function init() {
        // Initialize icons
        lucide.createIcons();

        // Setup backend event listeners
        setupBackendListeners();

        // Initialize backend connection
        if (window.BackendService) {
            try {
                await BackendService.init();
            } catch (e) {
                console.error('Backend init failed:', e);
                setStatus('error', 'Sin conexión');
            }
        } else {
            console.error('BackendService not found!');
            setStatus('error', 'Error');
        }
    }

    // Execute when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
