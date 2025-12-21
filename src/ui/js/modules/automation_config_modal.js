/**
 * Automation Config Modal Module
 * Configures automation parameters for form filling execution
 */
(function () {
    'use strict';

    let currentTabId = null;
    let currentConfig = {};
    let filterColumnValues = []; // Unique values from filter column

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function open(tabId, config = {}) {
        currentTabId = tabId;
        currentConfig = config || {};

        const modalOverlay = getOrCreateModal();
        renderModalContent(modalOverlay, currentConfig);

        if (window.ModalManager) {
            window.ModalManager.openModal(modalOverlay);
        } else {
            modalOverlay.style.display = 'flex';
            requestAnimationFrame(() => modalOverlay.classList.add('open'));
        }

        if (window.lucide) lucide.createIcons();
    }

    function close() {
        const modal = document.getElementById('af-auto-config-overlay');
        if (window.ModalManager) {
            window.ModalManager.closeModal(modal);
        } else {
            if (modal) {
                modal.classList.remove('open');
                setTimeout(() => { if (!modal.classList.contains('open')) modal.style.display = 'none'; }, 250);
            }
        }
        currentTabId = null;
        currentConfig = {};
    }

    function getOrCreateModal() {
        let el = document.getElementById('af-auto-config-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'af-auto-config-overlay';
            el.className = 'af-modal-overlay';
            el.innerHTML = `
                <div class="af-modal-window" id="af-auto-config-window" style="max-width:520px;">
                    <div class="af-window-header">
                        <div class="af-window-title" id="af-auto-cfg-title">
                            <i data-lucide="settings-2" class="w-5 h-5"></i>
                            <span>Configuración de Automatización</span>
                        </div>
                        <div class="af-window-close" onclick="AutomationConfigModal.close()">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </div>
                    </div>
                    
                    <div class="af-window-body" id="af-auto-cfg-body">
                        <!-- Dynamic Content -->
                    </div>
                    
                    <div class="af-window-footer">
                        <div style="flex:1"></div>
                        <button class="af-btn-ghost" onclick="AutomationConfigModal.close()">Cancelar</button>
                        <button class="af-btn-primary" id="af-auto-cfg-save-btn">Guardar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(el);

            // Make Draggable
            const win = el.querySelector('.af-modal-window');
            const header = el.querySelector('.af-window-header');
            if (window.ModalManager) {
                window.ModalManager.makeDraggable(win, header);
            }

            // Close on overlay click
            el.onmousedown = (e) => {
                if (e.target === el) close();
            };

            el.querySelector('#af-auto-cfg-save-btn').onclick = handleSave;
        }
        return el;
    }

    function renderModalContent(overlay, config) {
        const body = overlay.querySelector('#af-auto-cfg-body');
        const win = overlay.querySelector('.af-modal-window');

        // Apply accent
        win.classList.remove('accent-orange', 'accent-blue', 'accent-purple', 'accent-green');
        win.classList.add('accent-orange');

        const filterEnabled = config.filter?.enabled || false;
        const filterColumn = config.filter?.column || '';
        const filterOperator = config.filter?.operator || 'equals';
        const filterValue = config.filter?.value || '';
        const range = config.range || '';
        const controlColumn = config.controlColumn || '';

        let html = `
            <!-- SECTION 1: FILTER -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Filtrar Filas</div>
                <div class="af-config-row" style="align-items: flex-start; flex-direction: column; gap: 12px;">
                    <!-- Enable Toggle -->
                    <div class="flex items-center gap-2">
                        <div class="af-config-label" style="min-width:auto;">Activar Filtro</div>
                        <label class="af-switch">
                            <input type="checkbox" id="auto-cfg-filter-enable" ${filterEnabled ? 'checked' : ''}
                                   onchange="document.getElementById('auto-cfg-filter-area').style.display = this.checked ? 'flex' : 'none'">
                            <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                        </label>
                    </div>
                    
                    <!-- Filter Controls -->
                    <div id="auto-cfg-filter-area" style="display:${filterEnabled ? 'flex' : 'none'}; flex-wrap:wrap; gap:8px; align-items:center; width:100%;">
                        <span style="font-size:12px; font-weight:600; color:#374151;">Si:</span>
                        
                        <!-- Column Input with Backdrop -->
                        <div class="ac-smart-container" style="flex:1; min-width:120px; max-width:180px;">
                            <div id="auto-cfg-filter-col-bd" class="ac-smart-backdrop"></div>
                            <input type="text" id="auto-cfg-filter-col" class="ac-smart-input" 
                                   value="${escHtml(filterColumn)}" placeholder="{Columna}">
                        </div>
                        
                        <!-- Operator Dropdown -->
                        <select id="auto-cfg-filter-op" class="af-config-select" style="min-width:100px;">
                            <option value="equals" ${filterOperator === 'equals' ? 'selected' : ''}>Igual a</option>
                            <option value="notEquals" ${filterOperator === 'notEquals' ? 'selected' : ''}>No igual a</option>
                            <option value="contains" ${filterOperator === 'contains' ? 'selected' : ''}>Contiene</option>
                            <option value="startsWith" ${filterOperator === 'startsWith' ? 'selected' : ''}>Empieza con</option>
                        </select>
                        
                        <!-- Value Dropdown (populated dynamically) -->
                        <select id="auto-cfg-filter-val" class="af-config-select" style="flex:1; min-width:140px;">
                            <option value="">-- Seleccionar valor --</option>
                            ${filterValue ? `<option value="${escHtml(filterValue)}" selected>${escHtml(filterValue)}</option>` : ''}
                        </select>
                    </div>
                </div>
            </div>
            
            <!-- SECTION 2: RANGE -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Rango de Filas</div>
                <div class="af-config-row" style="flex-direction:column; gap:8px;">
                    <div class="flex items-center gap-2">
                        <div class="af-config-label" style="min-width:auto;">Filas a procesar:</div>
                        <input type="text" id="auto-cfg-range" class="af-config-input" 
                               style="width:150px;" value="${escHtml(range)}" placeholder="Ej: 1-10, 2,5,8">
                    </div>
                    <div style="font-size:11px; color:#6b7280; padding-left:4px; line-height:1.5;">
                        <div>• Vacío = Todas las filas</div>
                        <div>• Número: <code style="background:#f3f4f6; padding:1px 4px; border-radius:3px;">5</code> = Solo fila 5</div>
                        <div>• Rango: <code style="background:#f3f4f6; padding:1px 4px; border-radius:3px;">3-10</code> = Filas 3 a 10</div>
                        <div>• Lista: <code style="background:#f3f4f6; padding:1px 4px; border-radius:3px;">2,7,3</code> = Filas específicas</div>
                    </div>
                </div>
            </div>
            
            <!-- SECTION 3: CONTROL COLUMN -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Columna de Control</div>
                <div class="af-config-row" style="flex-direction:column; gap:8px;">
                    <div class="flex items-center gap-2">
                        <div class="af-config-label" style="min-width:auto;">Columna:</div>
                        <div class="ac-smart-container" style="flex:1; max-width:200px;">
                            <div id="auto-cfg-control-bd" class="ac-smart-backdrop"></div>
                            <input type="text" id="auto-cfg-control-col" class="ac-smart-input" 
                                   value="${escHtml(controlColumn)}" placeholder="{Columna}">
                        </div>
                    </div>
                    <div style="font-size:11px; color:#6b7280; padding-left:4px;">
                        Columna para marcar filas como procesadas (opcional)
                    </div>
                </div>
            </div>
        `;

        body.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        // Initialize smart inputs with backdrop highlighting
        setTimeout(() => {
            setupSmartInput('auto-cfg-filter-col', 'auto-cfg-filter-col-bd', true);
            setupSmartInput('auto-cfg-control-col', 'auto-cfg-control-bd', false);
        }, 0);
    }

    /**
     * Setup smart input with backdrop for column placeholder highlighting
     */
    function setupSmartInput(inputId, backdropId, triggerValueLoad = false) {
        const input = document.getElementById(inputId);
        const backdrop = document.getElementById(backdropId);
        if (!input || !backdrop) return;

        const update = () => {
            const text = input.value;
            let html = '';
            let lastIndex = 0;
            const regex = /\{([^{}]+)\}/g;
            let match;
            let foundValidColumn = null;

            const headers = window.globalHeaders || [];

            while ((match = regex.exec(text)) !== null) {
                html += escHtml(text.substring(lastIndex, match.index));

                const content = match[1];
                const cleanVal = content.trim();
                const isValid = headers.includes(cleanVal);

                if (isValid && cleanVal) foundValidColumn = cleanVal;

                const chipClass = isValid ? 'valid' : 'invalid';
                const iconHtml = isValid
                    ? ''
                    : '<i data-lucide="triangle-alert" class="ac-chip-icon" style="width:10px;height:10px;margin-left:8px;"></i>';

                html += `<span class="ac-smart-chip ${chipClass}">{${escHtml(content)}}${iconHtml}</span>`;
                lastIndex = regex.lastIndex;
            }
            html += escHtml(text.substring(lastIndex));

            backdrop.innerHTML = html;
            if (window.lucide) lucide.createIcons();

            // Load column values for filter dropdown
            if (triggerValueLoad && foundValidColumn) {
                loadFilterColumnValues(foundValidColumn);
            }
        };

        input.oninput = update;
        input.onscroll = () => { backdrop.scrollLeft = input.scrollLeft; };
        update();
    }

    /**
     * Load unique values from Excel column into filter value dropdown
     */
    function loadFilterColumnValues(columnName) {
        const select = document.getElementById('auto-cfg-filter-val');
        if (!select) return;

        const headers = window.globalHeaders || [];
        const data = window.globalExcelData || [];
        const colIndex = headers.indexOf(columnName);

        if (colIndex === -1) {
            select.innerHTML = '<option value="">Columna no encontrada</option>';
            return;
        }

        // Extract unique values
        const uniqueSet = new Set();
        for (let i = 0; i < data.length; i++) {
            const val = data[i][colIndex];
            if (val !== null && val !== undefined && val !== '') {
                uniqueSet.add(String(val));
            }
        }
        filterColumnValues = Array.from(uniqueSet).sort();

        // Populate dropdown
        const currentVal = currentConfig.filter?.value || '';
        select.innerHTML = '<option value="">-- Seleccionar valor --</option>' +
            filterColumnValues.map(v =>
                `<option value="${escHtml(v)}" ${v === currentVal ? 'selected' : ''}>${escHtml(v)}</option>`
            ).join('');
    }

    function handleSave() {
        const getVal = (id, def) => { const el = document.getElementById(id); return el ? (el.value || def) : def; };
        const getCheck = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };

        const newConfig = {
            filter: {
                enabled: getCheck('auto-cfg-filter-enable', false),
                column: getVal('auto-cfg-filter-col', ''),
                operator: getVal('auto-cfg-filter-op', 'equals'),
                value: getVal('auto-cfg-filter-val', '')
            },
            range: getVal('auto-cfg-range', ''),
            controlColumn: getVal('auto-cfg-control-col', '')
        };

        // TODO: Save to projectData or formData
        console.log('[AutomationConfig] Saved:', newConfig);

        close();
    }

    // Expose to global
    window.AutomationConfigModal = {
        open,
        close
    };
})();
