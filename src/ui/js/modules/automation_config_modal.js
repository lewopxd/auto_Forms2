/**
 * Automation Config Modal Module
 * Configures automation parameters for form filling execution
 * Supports advanced filter conditions with AND/OR logic
 */
(function () {
    'use strict';

    let currentTabId = null;
    let currentConfig = {};
    let filterColumnValues = {}; // Cache of unique values per column
    let conditionIdCounter = 0;

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function open(tabId, config = {}) {
        currentTabId = tabId;
        currentConfig = config || {};
        conditionIdCounter = 0;
        filterColumnValues = {};

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
        filterColumnValues = {};
    }

    function getOrCreateModal() {
        let el = document.getElementById('af-auto-config-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'af-auto-config-overlay';
            el.className = 'af-modal-overlay';
            el.innerHTML = `
                <div class="af-modal-window auto-cfg-modal-resizable" id="af-auto-config-window">
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

    /**
     * Convert legacy filter config to new conditions array format
     */
    function normalizeFilterConfig(filter) {
        if (!filter) return [];

        // Already in new format
        if (Array.isArray(filter.conditions)) {
            return filter.conditions;
        }

        // Legacy format: single condition
        if (filter.column || filter.value) {
            return [{
                id: 'cond-0',
                logic: 'IF',
                column: filter.column || '',
                operator: filter.operator || 'equals',
                value: filter.value || ''
            }];
        }

        return [];
    }

    function renderModalContent(overlay, config) {
        const body = overlay.querySelector('#af-auto-cfg-body');
        const win = overlay.querySelector('.af-modal-window');

        // Apply accent
        win.classList.remove('accent-orange', 'accent-blue', 'accent-purple', 'accent-green');
        win.classList.add('accent-orange');

        const filterEnabled = config.filter?.enabled || false;
        const conditions = normalizeFilterConfig(config.filter);
        const range = config.range || '';
        const controlColumn = config.controlColumn || '';

        let html = `
            <!-- SECTION 1: FILTER -->
            <div class="af-config-section">
                <div class="af-config-sec-title">
                    Filtrar Filas
                    <span class="auto-cfg-info-icon" title="Precedencia de operadores: AND tiene mayor prioridad que OR.&#10;Ejemplo: A OR B AND C = A OR (B AND C)">
                        <i data-lucide="info" style="width:14px;height:14px;"></i>
                    </span>
                </div>
                <div class="af-config-row" style="align-items: flex-start; flex-direction: column; gap: 12px;">
                    <!-- Enable Toggle -->
                    <div class="flex items-center gap-2">
                        <div class="af-config-label" style="min-width:auto;">Activar Filtro</div>
                        <label class="af-switch">
                            <input type="checkbox" id="auto-cfg-filter-enable" ${filterEnabled ? 'checked' : ''}
                                   onchange="document.getElementById('auto-cfg-filter-area').style.display = this.checked ? 'block' : 'none'">
                            <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                        </label>
                    </div>
                    
                    <!-- Filter Conditions Container -->
                    <div id="auto-cfg-filter-area" style="display:${filterEnabled ? 'block' : 'none'}; width:100%;">
                        <div class="auto-cfg-conditions-wrapper">
                            <div class="auto-cfg-conditions-table" id="auto-cfg-conditions-table">
                                <!-- Condition rows will be inserted here -->
                            </div>
                        </div>
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
                <div class="af-config-sec-title">Columna(s) de Control</div>
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
                        Opcional. Se usará para mostrar la fila activa en el status
                    </div>
                </div>
            </div>
            
            <!-- SECTION 4: POST SUBMIT ACTIONS -->
            <div class="af-config-section af-config-section-collapsible" id="auto-cfg-postsubmit-section">
                <div class="af-config-sec-title af-collapsible-header" onclick="AutomationConfigModal.toggleSection('postsubmit')">
                    <span class="af-collapse-icon" id="auto-cfg-postsubmit-icon">
                        <i data-lucide="chevron-right" style="width:16px;height:16px;"></i>
                    </span>
                    Post Submit Actions
                    <span class="af-config-sec-badge" style="margin-left:8px; font-size:10px; padding:2px 6px; background:#f97316; color:white; border-radius:4px;">NUEVO</span>
                </div>
                <div class="af-config-collapsible-content" id="auto-cfg-postsubmit-content" style="display:none;">
                    <div class="af-config-row" style="flex-direction:column; gap:12px; padding-top:12px;">
                        <!-- Enable Toggle -->
                        <div class="flex items-center gap-3">
                            <label class="af-switch">
                                <input type="checkbox" id="auto-cfg-postsubmit-enable" 
                                       ${config.postSubmit?.enabled ? 'checked' : ''}
                                       ${config.postSubmit?.available === false ? 'disabled' : ''}>
                                <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                            </label>
                            <div class="af-config-label" style="min-width:auto;">Guardar respuesta si disponible</div>
                        </div>
                        
                        <!-- Info box -->
                        <div style="display:flex; gap:8px; padding:10px 12px; background:rgba(249,115,22,0.08); border-radius:6px; border-left:3px solid #f97316;">
                            <i data-lucide="info" style="width:16px;height:16px;color:#f97316;flex-shrink:0;margin-top:1px;"></i>
                            <div style="font-size:11px; color:#6b7280; line-height:1.5;">
                                Si está habilitado, después de cada envío se capturará automáticamente el link de edición 
                                del formulario. Esto permite mantener un registro de todas las respuestas enviadas.
                            </div>
                        </div>
                        
                        <!-- Status indicator -->
                        <div class="flex items-center gap-2" style="padding-left:4px;">
                            <span style="font-size:11px; color:#6b7280;">Estado:</span>
                            ${config.postSubmit?.available !== false
                ? '<span style="color:#10b981; font-size:11px;"><i data-lucide="check-circle" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:4px;"></i>Disponible en paquete</span>'
                : '<span style="color:#9ca3af; font-size:11px;"><i data-lucide="x-circle" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:4px;"></i>No disponible</span>'
            }
                        </div>
                        
                        <!-- Timeout config -->
                        <div class="flex items-center gap-2" style="padding-left:4px;">
                            <span style="font-size:11px; color:#6b7280;">Timeout:</span>
                            <input type="number" id="auto-cfg-postsubmit-timeout" class="af-config-input" 
                                   style="width:80px; font-size:11px; padding:4px 8px;" 
                                   value="${config.postSubmit?.timeoutMs || 60000}" min="10000" max="300000" step="5000">
                            <span style="font-size:11px; color:#6b7280;">ms</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        body.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        // Render initial conditions
        const tableEl = document.getElementById('auto-cfg-conditions-table');
        if (conditions.length === 0) {
            // Add default first condition
            addConditionRow(tableEl, { logic: 'IF', column: '', operator: 'equals', value: '' }, true);
        } else {
            conditions.forEach((cond, idx) => {
                addConditionRow(tableEl, cond, idx === 0);
            });
        }

        // Update button visibility
        updateConditionButtons();

        // Initialize smart input for control column
        setTimeout(() => {
            setupSmartInput('auto-cfg-control-col', 'auto-cfg-control-bd', false);
        }, 0);
    }

    /**
     * Add a condition row to the table
     */
    function addConditionRow(tableEl, condition, isFirst = false) {
        const condId = 'cond-' + (conditionIdCounter++);
        const row = document.createElement('div');
        row.className = 'auto-cfg-condition-row';
        row.dataset.condId = condId;
        if (isFirst) row.classList.add('first');

        const logicCell = isFirst
            ? `<div class="auto-cfg-cell logic"><span class="auto-cfg-logic-label">IF</span></div>`
            : `<div class="auto-cfg-cell logic">
                <select class="auto-cfg-logic-select" data-field="logic">
                    <option value="AND" ${condition.logic === 'AND' ? 'selected' : ''}>AND</option>
                    <option value="OR" ${condition.logic === 'OR' ? 'selected' : ''}>OR</option>
                </select>
               </div>`;

        const operatorOptions = `
            <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>Igual a</option>
            <option value="notEquals" ${condition.operator === 'notEquals' ? 'selected' : ''}>No igual a</option>
            <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>Contiene</option>
            <option value="startsWith" ${condition.operator === 'startsWith' ? 'selected' : ''}>Empieza con</option>
        `;

        row.innerHTML = `
            ${logicCell}
            <div class="auto-cfg-cell column">
                <div class="ac-smart-container auto-cfg-col-input">
                    <div class="ac-smart-backdrop" id="bd-${condId}"></div>
                    <input type="text" class="ac-smart-input" data-field="column" 
                           value="${escHtml(condition.column || '')}" placeholder="{Columna}">
                </div>
            </div>
            <div class="auto-cfg-cell operator">
                <select class="af-config-select auto-cfg-op-select" data-field="operator">
                    ${operatorOptions}
                </select>
            </div>
            <div class="auto-cfg-cell value">
                <select class="af-config-select auto-cfg-val-select" data-field="value">
                    <option value="">-- Valor --</option>
                    ${condition.value ? `<option value="${escHtml(condition.value)}" selected>${escHtml(condition.value)}</option>` : ''}
                </select>
            </div>
            <div class="auto-cfg-cell actions">
                <button class="auto-cfg-btn-remove" title="Eliminar condición" ${isFirst ? 'style="visibility:hidden;"' : ''}>
                    <i data-lucide="minus" style="width:14px;height:14px;"></i>
                </button>
                <button class="auto-cfg-btn-add" title="Agregar condición">
                    <i data-lucide="plus" style="width:14px;height:14px;"></i>
                </button>
            </div>
        `;

        tableEl.appendChild(row);

        // Setup smart input for column
        const colInput = row.querySelector('input[data-field="column"]');
        const backdrop = row.querySelector(`#bd-${condId}`);
        setupRowSmartInput(colInput, backdrop, row);

        // Setup event listeners
        const removeBtn = row.querySelector('.auto-cfg-btn-remove');
        const addBtn = row.querySelector('.auto-cfg-btn-add');

        removeBtn.onclick = () => {
            row.remove();
            updateConditionButtons();
        };

        addBtn.onclick = () => {
            addConditionRow(tableEl, { logic: 'AND', column: '', operator: 'equals', value: '' }, false);
            updateConditionButtons();
            if (window.lucide) lucide.createIcons();
        };

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Update which buttons are visible (only last row shows add button)
     */
    function updateConditionButtons() {
        const rows = document.querySelectorAll('.auto-cfg-condition-row');
        rows.forEach((row, idx) => {
            const addBtn = row.querySelector('.auto-cfg-btn-add');
            const removeBtn = row.querySelector('.auto-cfg-btn-remove');

            // Only show add button on last row
            if (addBtn) {
                addBtn.style.display = idx === rows.length - 1 ? 'flex' : 'none';
            }

            // Hide remove button on first row
            if (removeBtn) {
                removeBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
            }
        });
    }

    /**
     * Setup smart input with backdrop for a condition row
     */
    function setupRowSmartInput(input, backdrop, row) {
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

            // Load column values for value dropdown
            if (foundValidColumn) {
                loadRowFilterValues(foundValidColumn, row);
            }
        };

        input.oninput = update;
        input.onscroll = () => { backdrop.scrollLeft = input.scrollLeft; };
        update();
    }

    /**
     * Load unique values from Excel column into a row's value dropdown
     */
    function loadRowFilterValues(columnName, row) {
        const select = row.querySelector('select[data-field="value"]');
        if (!select) return;

        const headers = window.globalHeaders || [];
        const data = window.globalExcelData || [];
        const colIndex = headers.indexOf(columnName);

        if (colIndex === -1) {
            select.innerHTML = '<option value="">Columna no encontrada</option>';
            return;
        }

        // Use cached values if available
        if (!filterColumnValues[columnName]) {
            const uniqueSet = new Set();
            for (let i = 0; i < data.length; i++) {
                const val = data[i][colIndex];
                if (val !== null && val !== undefined && val !== '') {
                    uniqueSet.add(String(val));
                }
            }
            filterColumnValues[columnName] = Array.from(uniqueSet).sort();
        }

        const values = filterColumnValues[columnName];
        const currentVal = select.value;

        select.innerHTML = '<option value="">-- Valor --</option>' +
            values.map(v =>
                `<option value="${escHtml(v)}" ${v === currentVal ? 'selected' : ''}>${escHtml(v)}</option>`
            ).join('');
    }

    /**
     * Setup smart input with backdrop for column placeholder highlighting (for control column)
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

            const headers = window.globalHeaders || [];

            while ((match = regex.exec(text)) !== null) {
                html += escHtml(text.substring(lastIndex, match.index));

                const content = match[1];
                const cleanVal = content.trim();
                const isValid = headers.includes(cleanVal);

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
        };

        input.oninput = update;
        input.onscroll = () => { backdrop.scrollLeft = input.scrollLeft; };
        update();
    }

    /**
     * Collect all conditions from the UI
     */
    function collectConditions() {
        const conditions = [];
        const rows = document.querySelectorAll('.auto-cfg-condition-row');

        rows.forEach((row, idx) => {
            const isFirst = idx === 0;
            const logicEl = isFirst ? null : row.querySelector('select[data-field="logic"]');
            const columnEl = row.querySelector('input[data-field="column"]');
            const operatorEl = row.querySelector('select[data-field="operator"]');
            const valueEl = row.querySelector('select[data-field="value"]');

            conditions.push({
                logic: isFirst ? 'IF' : (logicEl?.value || 'AND'),
                column: columnEl?.value || '',
                operator: operatorEl?.value || 'equals',
                value: valueEl?.value || ''
            });
        });

        return conditions;
    }

    function handleSave() {
        const getVal = (id, def) => { const el = document.getElementById(id); return el ? (el.value || def) : def; };
        const getCheck = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };
        const getNum = (id, def) => { const el = document.getElementById(id); return el ? (parseInt(el.value, 10) || def) : def; };

        const conditions = collectConditions();

        const newConfig = {
            filter: {
                enabled: getCheck('auto-cfg-filter-enable', false),
                conditions: conditions
            },
            range: getVal('auto-cfg-range', ''),
            controlColumn: getVal('auto-cfg-control-col', ''),
            postSubmit: {
                enabled: getCheck('auto-cfg-postsubmit-enable', false),
                timeoutMs: getNum('auto-cfg-postsubmit-timeout', 60000),
                available: currentConfig.postSubmit?.available !== false
            }
        };

        // Save to AutoFormViewModule
        if (currentTabId && window.AutoFormViewModule) {
            window.AutoFormViewModule.updateAutomationConfig(currentTabId, newConfig);
        }

        close();
    }

    /**
     * Toggle collapsible section visibility
     */
    function toggleSection(sectionName) {
        const content = document.getElementById(`auto-cfg-${sectionName}-content`);
        const icon = document.getElementById(`auto-cfg-${sectionName}-icon`);

        if (!content || !icon) return;

        const isExpanded = content.style.display !== 'none';

        if (isExpanded) {
            content.style.display = 'none';
            icon.innerHTML = '<i data-lucide="chevron-right" style="width:16px;height:16px;"></i>';
        } else {
            content.style.display = 'block';
            icon.innerHTML = '<i data-lucide="chevron-down" style="width:16px;height:16px;"></i>';
        }

        if (window.lucide) lucide.createIcons();
    }

    // Expose to global
    window.AutomationConfigModal = {
        open,
        close,
        toggleSection
    };
})();

