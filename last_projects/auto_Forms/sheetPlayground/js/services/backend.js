/**
 * Backend Communication Service
 * Replaces localStorage with backend API for persistence
 * Provides WebSocket connection and REST API access
 */
const BackendService = (function () {
    'use strict';

    // ========== State ==========
    let dataWs = null;
    let isConnected = false;
    let currentProject = null;
    let saveTimeout = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 10;
    const RECONNECT_DELAY = 2000;
    const AUTO_SAVE_DELAY = 2000;

    // Event listeners
    const listeners = {};

    // ========== WebSocket Connection ==========

    /**
     * Connect to backend WebSocket
     */
    async function connect() {
        return new Promise((resolve, reject) => {
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const url = `${protocol}//${location.host}/ws/data`;

            console.log('[Backend] Connecting to', url);
            dataWs = new WebSocket(url);

            dataWs.onopen = () => {
                console.log('[Backend] ✅ Connected');
                isConnected = true;
                reconnectAttempts = 0;
                updateFooterConnection(true);
                emit('connected');
                resolve();
            };

            dataWs.onclose = () => {
                console.log('[Backend] ❌ Disconnected');
                isConnected = false;
                updateFooterConnection(false);
                emit('disconnected');
                attemptReconnect();
            };

            dataWs.onerror = (e) => {
                console.error('[Backend] Error:', e);
                reject(e);
            };

            dataWs.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleWsMessage(msg);
                } catch (e) {
                    console.error('[Backend] Parse error:', e);
                }
            };
        });
    }

    /**
     * Handle incoming WebSocket messages
     */
    function handleWsMessage(msg) {
        // Emit to type-specific listeners
        emit(msg.type, msg);

        // Handle common types
        switch (msg.type) {
            case 'connected':
                console.log('[Backend] Channel:', msg.data?.message);
                break;
            case 'pong':
                console.log('[Backend] Pong received');
                break;
        }
    }

    /**
     * Attempt reconnection with exponential backoff
     */
    function attemptReconnect() {
        if (reconnectAttempts >= MAX_RECONNECT) {
            console.error('[Backend] Max reconnection attempts reached');
            updateFooterStatus('error', 'Sin conexión');
            return;
        }

        reconnectAttempts++;
        const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
        console.log(`[Backend] Reconnecting in ${delay}ms (${reconnectAttempts}/${MAX_RECONNECT})...`);
        updateFooterConnection('reconnecting');

        setTimeout(() => {
            connect().catch(() => { }); // Will retry via onclose
        }, delay);
    }

    // ========== REST API: Projects ==========

    /**
     * Get app state (including last project ID)
     */
    async function getAppState() {
        const res = await fetch('/api/projects/state');
        if (!res.ok) throw new Error('Failed to get app state');
        return res.json();
    }

    /**
     * List all projects
     */
    async function listProjects() {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Failed to list projects');
        return res.json();
    }

    /**
     * Load a project by ID
     */
    async function loadProject(projectId) {
        updateFooterStatus('loading', 'Cargando...');

        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
            updateFooterStatus('error', 'Error al cargar');
            throw new Error('Project not found');
        }

        const data = await res.json();
        currentProject = data;

        // Update UI
        updateFooterProject(data.name);
        updateFooterStatus('saved', 'Cargado');

        // Emit for UI modules to restore state
        emit('project_loaded', data);

        return data;
    }

    /**
     * Create a new project
     */
    async function createProject(name) {
        updateFooterStatus('saving', 'Creando...');

        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (!res.ok) {
            updateFooterStatus('error', 'Error al crear');
            throw new Error('Failed to create project');
        }

        const data = await res.json();
        currentProject = data;

        updateFooterProject(data.name);
        updateFooterStatus('saved', 'Creado');

        emit('project_created', data);
        return data;
    }

    /**
     * Save current project state
     */
    async function saveProject(immediate = false) {
        if (!currentProject?.id) {
            console.warn('[Backend] No project to save');
            return;
        }

        // Debounce saves unless immediate
        if (!immediate) {
            updateFooterStatus('modified', 'Modificado');
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => saveProject(true), AUTO_SAVE_DELAY);
            return;
        }

        updateFooterStatus('saving', 'Guardando...');

        // Collect current state from global
        const projectData = {
            tabs: window.projectData?.tabs || [],
            ui: {
                splitterPosition: getSplitterPosition(),
                activeTab: getActiveTabId(),
                showCheckColumn: window.projectData?.showCheckColumn || false
            }
        };

        // Include excel info if available
        if (window.projectData?.excel) {
            projectData.excel = window.projectData.excel;
        }

        try {
            const res = await fetch(`/api/projects/${currentProject.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });

            if (!res.ok) throw new Error('Save failed');

            const result = await res.json();
            currentProject.updated = result.updated;

            updateFooterStatus('saved', 'Guardado');
            emit('project_saved', result);

        } catch (e) {
            console.error('[Backend] Save error:', e);
            updateFooterStatus('error', 'Error al guardar');
        }
    }

    /**
     * Trigger auto-save (debounced)
     */
    function triggerAutoSave() {
        saveProject(false); // debounced
    }

    // ========== REST API: Excel ==========

    /**
     * Open file dialog and parse selected Excel
     */
    async function browseAndParseExcel() {
        updateFooterStatus('loading', 'Seleccionando...');

        try {
            const res = await fetch('/api/excel/browse-and-parse', {
                method: 'POST'
            });

            const data = await res.json();

            if (data.cancelled) {
                updateFooterStatus('saved', 'Cancelado');
                return null;
            }

            if (!res.ok) throw new Error(data.detail || 'Parse failed');

            // Store complete excel info including parsed data
            if (window.projectData) {
                window.projectData.excel = {
                    path: data.path,
                    filename: data.filename,
                    sheets: data.sheets,
                    activeSheet: data.activeSheet,
                    // Store parsed data for saving
                    headers: data.headers,
                    rows: data.rows,
                    rowCount: data.rowCount
                };
            }

            updateFooterExcel(data.filename, data.rowCount);
            updateFooterStatus('saved', 'Excel cargado');

            emit('excel_loaded', data);
            triggerAutoSave();

            return data;

        } catch (e) {
            console.error('[Backend] Excel error:', e);
            updateFooterStatus('error', 'Error Excel');
            return null;
        }
    }

    /**
     * Parse Excel from known path
     */
    async function parseExcel(path, sheet = null) {
        const res = await fetch('/api/excel/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, sheet })
        });

        if (!res.ok) throw new Error('Parse failed');

        const data = await res.json();
        emit('excel_loaded', data);
        return data;
    }

    // ========== Footer Updates ==========

    function updateFooterConnection(status) {
        const dot = document.querySelector('#status-footer .conn-status');
        const label = document.querySelector('#status-footer .conn-label');

        if (dot) {
            dot.className = 'status-dot conn-status';
            if (status === true || status === 'connected') {
                dot.classList.add('connected');
            } else if (status === 'reconnecting') {
                dot.classList.add('reconnecting');
            } else {
                dot.classList.add('disconnected');
            }
        }

        if (label) {
            if (status === true || status === 'connected') {
                label.textContent = 'Conectado';
            } else if (status === 'reconnecting') {
                label.textContent = 'Reconectando...';
            } else {
                label.textContent = 'Desconectado';
            }
        }
    }

    function updateFooterProject(name) {
        const el = document.querySelector('#status-footer .project-name');
        if (el) el.textContent = name || 'Sin proyecto';
    }

    function updateFooterExcel(filename, rowCount) {
        const el = document.querySelector('#status-footer .excel-info');
        if (el) {
            if (filename) {
                el.textContent = `${filename} (${rowCount || 0} filas)`;
            } else {
                el.textContent = 'Sin Excel';
            }
        }
    }

    function updateFooterStatus(type, text) {
        const el = document.querySelector('#status-footer .save-status');
        if (!el) return;

        const icons = {
            loading: '⏳',
            saving: '💾',
            saved: '✓',
            modified: '●',
            error: '⚠'
        };

        el.textContent = `${icons[type] || ''} ${text}`;
        el.className = 'save-status ' + type;
    }

    // ========== Helpers ==========

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

    // ========== Event System ==========

    function on(event, callback) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
    }

    function off(event, callback) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(cb => cb !== callback);
    }

    function emit(event, data) {
        (listeners[event] || []).forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`[Backend] Event handler error (${event}):`, e);
            }
        });
    }

    // ========== Initialization ==========

    /**
     * Initialize backend connection and load last project
     */
    async function init() {
        try {
            // Connect WebSocket
            await connect();

            // Get app state to find last project
            const state = await getAppState();

            if (state.currentProjectPath) {
                // Load from last path
                console.log('[Backend] Loading from last path');
                const data = await openProjectFromPath(state.currentProjectPath);
                if (!data) {
                    // Path no longer valid, try creating new
                    console.log('[Backend] Last path invalid, creating new');
                    updateFooterProject('Sin proyecto');
                    updateFooterStatus('saved', 'Nuevo');
                }
            } else if (state.lastProjectId) {
                // Fallback to ID-based load
                console.log('[Backend] Loading last project:', state.lastProjectId);
                await loadProject(state.lastProjectId);
            } else {
                // No project, show empty state
                console.log('[Backend] No recent project');
                updateFooterProject('Sin proyecto');
                updateFooterStatus('saved', 'Listo');
            }

        } catch (e) {
            console.error('[Backend] Init error:', e);
            updateFooterStatus('error', 'Error de conexión');
        }
    }

    // ========== Desktop-Style Save/Open ==========

    /**
     * Save project (uses current path or prompts for new)
     */
    async function save() {
        updateFooterStatus('saving', 'Guardando...');

        const projectData = collectProjectData();

        try {
            const res = await fetch('/api/projects/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });

            const result = await res.json();

            if (result.cancelled) {
                updateFooterStatus('saved', 'Cancelado');
                return null;
            }

            if (!res.ok) throw new Error(result.detail || 'Save failed');

            // Update current project with name from backend
            currentProject = {
                ...currentProject,
                ...result
            };

            // Update window.projectData.name if backend returned a name
            if (window.projectData && result.name) {
                window.projectData.name = result.name;
            }

            updateFooterProject(result.name || projectData.name);
            updateFooterStatus('saved', 'Guardado');
            emit('project_saved', result);

            return result;

        } catch (e) {
            console.error('[Backend] Save error:', e);
            updateFooterStatus('error', 'Error al guardar');
            return null;
        }
    }

    /**
     * Save As (always prompts for new location)
     */
    async function saveAs() {
        updateFooterStatus('saving', 'Guardando...');

        const projectData = collectProjectData();

        try {
            const res = await fetch('/api/projects/save-as', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(projectData)
            });

            const result = await res.json();

            if (result.cancelled) {
                updateFooterStatus('saved', 'Cancelado');
                return null;
            }

            if (!res.ok) throw new Error(result.detail || 'Save failed');

            // Update current project with name from backend (based on filename)
            currentProject = {
                ...currentProject,
                ...result
            };

            // Update window.projectData.name to match filename
            if (window.projectData && result.name) {
                window.projectData.name = result.name;
            }

            updateFooterProject(result.name || projectData.name);
            updateFooterStatus('saved', 'Guardado');
            emit('project_saved', result);

            return result;

        } catch (e) {
            console.error('[Backend] SaveAs error:', e);
            updateFooterStatus('error', 'Error al guardar');
            return null;
        }
    }

    /**
     * Open project via native file dialog
     */
    async function openProjectDialog() {
        updateFooterStatus('loading', 'Abriendo...');

        try {
            const res = await fetch('/api/projects/open');
            const data = await res.json();

            if (data.cancelled) {
                updateFooterStatus('saved', 'Cancelado');
                return null;
            }

            if (!res.ok) throw new Error(data.detail || 'Open failed');

            currentProject = data;
            updateFooterProject(data.name);
            updateFooterStatus('saved', 'Cargado');

            emit('project_loaded', data);
            return data;

        } catch (e) {
            console.error('[Backend] Open error:', e);
            updateFooterStatus('error', 'Error al abrir');
            return null;
        }
    }

    /**
     * Open project from known path (for init or recent)
     */
    async function openProjectFromPath(path) {
        try {
            // Read the project file via a simple file read endpoint
            const res = await fetch('/api/projects/load-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });

            if (!res.ok) return null;

            const data = await res.json();
            if (data.error) return null;

            currentProject = data;
            updateFooterProject(data.name);
            updateFooterStatus('saved', 'Cargado');

            emit('project_loaded', data);
            return data;
        } catch (e) {
            console.error('[Backend] Load from path error:', e);
            return null;
        }
    }

    /**
     * Get list of recent projects
     */
    async function getRecentProjects() {
        try {
            const res = await fetch('/api/projects/recent');
            if (!res.ok) return [];
            const data = await res.json();
            return data.recent || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Load a recent project by path
     */
    async function loadRecentProject(path) {
        updateFooterStatus('loading', 'Cargando...');

        try {
            const res = await fetch('/api/projects/load-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.detail || 'Load failed');

            currentProject = data;
            updateFooterProject(data.name);
            updateFooterStatus('saved', 'Cargado');

            emit('project_loaded', data);
            return data;

        } catch (e) {
            console.error('[Backend] Load recent error:', e);
            updateFooterStatus('error', 'Error al cargar');
            return null;
        }
    }

    /**
     * Collect current project data for saving
     */
    function collectProjectData() {
        // Priority: window.projectData.name > currentProject.name > default
        const name = window.projectData?.name || currentProject?.name || 'Mi Proyecto';

        // Collect Excel data (path + parsed data for offline access)
        const excel = window.projectData?.excel ? {
            path: window.projectData.excel.path,
            filename: window.projectData.excel.filename,
            sheets: window.projectData.excel.sheets,
            activeSheet: window.projectData.excel.activeSheet,
            // Include parsed data so we don't need to re-parse on load
            headers: window.projectData.excel.headers,
            rows: window.projectData.excel.rows,
            rowCount: window.projectData.excel.rowCount
        } : null;

        return {
            name: name,
            excel: excel,
            forms: window.projectData?.forms || [],
            tabs: window.projectData?.tabs || [],
            ui: {
                splitterPosition: getSplitterPosition(),
                activeTab: getActiveTabId(),
                showCheckColumn: window.projectData?.showCheckColumn || false
            },
            checkColumnData: window.projectData?.checkColumnData || {}
        };
    }

    // ========== Public API ==========

    return {
        // Connection
        connect,
        init,
        isConnected: () => isConnected,

        // Projects (Desktop Style)
        save,
        saveAs,
        openProjectDialog,
        getRecentProjects,
        loadRecentProject,
        getCurrentProject: () => currentProject,
        getAppState,

        // Legacy (for compatibility)
        listProjects,
        loadProject,
        createProject,
        saveProject,
        triggerAutoSave,

        // Excel
        browseAndParseExcel,
        parseExcel,

        // Events
        on,
        off
    };
})();

// Expose globally
window.BackendService = BackendService;
