/**
 * Export Modal Module
 * Handles exporting AutoForm responses to Excel
 * 
 * Features:
 * - Multi-select column selection from source Excel
 * - Configurable question header format (Q1, title, number+title)
 * - Optional filter status column
 * - Progress bar during export
 * - Uses automation config (filters/range) if enabled
 */
(function () {
    'use strict';

    let currentTabId = null;
    let currentFormData = null;
    let exportInProgress = false;

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function generateDefaultFilename() {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
        return `export_${dateStr}_${timeStr}`;
    }

    // ========================================
    // MODAL OPEN/CLOSE
    // ========================================

    async function open(tabId) {
        // Validate Excel is loaded
        if (!window.globalHeaders || window.globalHeaders.length === 0) {
            window.showAlert({
                icon: 'alert-triangle',
                iconColor: 'text-orange-500',
                title: 'Excel No Cargado',
                message: 'Debes cargar un archivo Excel en la pestaña de datos antes de exportar.',
                confirmText: 'Entendido',
                confirmColor: 'bg-orange-600 hover:bg-orange-700'
            });
            return;
        }

        // Get form data from AutoFormViewModule
        const tabData = window.AutoFormViewModule?.getTabData?.(tabId);
        if (!tabData || !tabData.formData) {
            window.showAlert({
                icon: 'alert-triangle',
                iconColor: 'text-orange-500',
                title: 'Grabación No Cargada',
                message: 'Debes cargar una grabación de formulario antes de exportar.',
                confirmText: 'Entendido',
                confirmColor: 'bg-orange-600 hover:bg-orange-700'
            });
            return;
        }

        currentTabId = tabId;
        currentFormData = tabData.formData;

        const modal = getOrCreateModal();
        await renderModalContent(modal);

        if (window.ModalManager) {
            window.ModalManager.openModal(modal);
        } else {
            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('open'));
        }

        if (window.lucide) lucide.createIcons();
    }

    function close() {
        if (exportInProgress) return; // Prevent closing during export

        const modal = document.getElementById('export-modal-overlay');
        if (window.ModalManager) {
            window.ModalManager.closeModal(modal);
        } else if (modal) {
            modal.classList.remove('open');
            setTimeout(() => { if (!modal.classList.contains('open')) modal.style.display = 'none'; }, 250);
        }
        currentTabId = null;
        currentFormData = null;
    }

    // ========================================
    // MODAL CREATION
    // ========================================

    function getOrCreateModal() {
        let el = document.getElementById('export-modal-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'export-modal-overlay';
            el.className = 'af-modal-overlay';
            el.innerHTML = `
                <div class="af-modal-window accent-orange export-modal" id="export-modal-window">
                    <div class="af-window-header">
                        <div class="af-window-title">
                            <i data-lucide="file-spreadsheet" class="w-5 h-5"></i>
                            <span>Exportar a Excel</span>
                        </div>
                        <div class="af-window-close" id="export-modal-close">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </div>
                    </div>
                    
                    <div class="af-window-body" id="export-modal-body">
                        <!-- Dynamic Content -->
                    </div>
                    
                    <!-- Progress bar (hidden by default) -->
                    <div class="export-progress-container" id="export-progress-container" style="display:none;">
                        <div class="export-progress-bar" id="export-progress-bar"></div>
                    </div>
                    
                    <div class="af-window-footer" id="export-modal-footer">
                        <div style="flex:1"></div>
                        <button class="af-btn-ghost" id="export-btn-cancel">Cancelar</button>
                        <button class="af-btn-primary" id="export-btn-export">
                            <i data-lucide="download" class="w-4 h-4"></i>
                            Exportar
                        </button>
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
                if (e.target === el && !exportInProgress) close();
            };

            // Button handlers
            el.querySelector('#export-modal-close').onclick = close;
            el.querySelector('#export-btn-cancel').onclick = close;
            el.querySelector('#export-btn-export').onclick = handleExport;
        }
        return el;
    }

    async function renderModalContent(overlay) {
        const body = overlay.querySelector('#export-modal-body');
        const headers = window.globalHeaders || [];
        const excelFilename = window.globalExcelFilename || 'Sin archivo';
        const activeSheet = window.globalActiveSheet || 'Hoja 1';

        // Debug: log global vars
        console.log('[Export Modal] globalExcelFilename:', window.globalExcelFilename);
        console.log('[Export Modal] globalActiveSheet:', window.globalActiveSheet);
        console.log('[Export Modal] globalExcelData:', window.globalExcelData?.length);

        // Get default export path
        let defaultPath = '';
        try {
            const pathResult = await window.bridgePy.send('get_default_export_path', {});
            if (pathResult.success && pathResult.path) {
                defaultPath = pathResult.path;
            }
        } catch (e) {
            console.error('[Export] Error getting default path:', e);
        }

        // Get question data for preview
        const questions = getQuestionsList();

        body.innerHTML = `
            <!-- SOURCE INFO -->
            <div class="af-config-section">
                <div class="af-config-sec-title">
                    <i data-lucide="file" class="w-4 h-4" style="display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                    Archivo Fuente
                </div>
                <div class="export-source-info">
                    <div class="export-source-row">
                        <span class="export-source-label">Excel:</span>
                        <span class="export-source-value">${escHtml(excelFilename)}</span>
                    </div>
                    <div class="export-source-row">
                        <span class="export-source-label">Hoja:</span>
                        <span class="export-source-value">${escHtml(activeSheet)}</span>
                    </div>
                    <div class="export-source-row">
                        <span class="export-source-label">Total filas:</span>
                        <span class="export-source-value">${(window.globalExcelData || []).length}</span>
                    </div>
                </div>
            </div>

            <!-- OUTPUT FILE -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Archivo de Salida</div>
                <div class="af-config-row" style="gap:8px;">
                    <input type="text" id="export-filename" class="af-config-input" 
                           style="flex:1;" value="${generateDefaultFilename()}" placeholder="nombre_archivo">
                    <span class="text-xs text-gray-500">.xlsx</span>
                </div>
                <div class="af-config-row" style="gap:8px; margin-top:8px;">
                    <input type="text" id="export-path" class="af-config-input" 
                           style="flex:1;" value="${escHtml(defaultPath)}" placeholder="Selecciona carpeta de destino..." readonly>
                    <button class="af-btn-ghost export-browse-btn" id="export-browse-btn">
                        <i data-lucide="folder-open" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <!-- COLUMNS TO INCLUDE -->
            <div class="af-config-section">
                <div class="af-config-sec-title" style="display:flex;align-items:center;justify-content:space-between;">
                    <span>Columnas del Excel a Incluir</span>
                    <label class="export-toggle-all" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="export-toggle-all-checkbox" checked>
                        <span id="export-toggle-all-label" style="font-size:11px;color:#6b7280;">Desmarcar todas</span>
                    </label>
                </div>
                <div class="export-columns-container" id="export-columns-container">
                    ${headers.map((h, i) => `
                        <label class="export-column-item">
                            <input type="checkbox" value="${i}" data-col="${escHtml(h)}" checked>
                            <span>${escHtml(h)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>

            <!-- QUESTION HEADER FORMAT -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Formato de Encabezados de Preguntas</div>
                <div class="af-config-row">
                    <select id="export-header-format" class="af-config-select" style="flex:1;">
                        <option value="number">Número (Q1, Q2, Q3...)</option>
                        <option value="title" selected>Título de la pregunta</option>
                        <option value="numbered-title">Número + Título (1. Pregunta, 2. Pregunta...)</option>
                    </select>
                </div>
                <div class="export-preview-headers" id="export-preview-headers">
                    <!-- Preview will be rendered here -->
                </div>
            </div>

            <!-- OPTIONS -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Opciones</div>
                
                <label class="export-option-row">
                    <input type="checkbox" id="export-use-automation" class="af-checkbox-blue" checked>
                    <span>Usar configuración de automatización</span>
                    <span class="export-option-hint">(Filtros y rango de filas)</span>
                </label>
                
                <label class="export-option-row">
                    <input type="checkbox" id="export-include-filter-status" class="af-checkbox-blue">
                    <span>Incluir columna de estado del filtro</span>
                    <span class="export-option-hint">(Ej: ESTADO=ACTIVO & TRABAJOS=SI)</span>
                </label>
            </div>
        `;

        // Attach event handlers
        body.querySelector('#export-browse-btn').onclick = handleBrowseFolder;
        body.querySelector('#export-header-format').onchange = updateHeaderPreview;

        // Toggle all checkbox handler
        const toggleAllCheckbox = body.querySelector('#export-toggle-all-checkbox');
        const toggleAllLabel = body.querySelector('#export-toggle-all-label');
        const updateToggleLabel = () => {
            const allChecked = Array.from(document.querySelectorAll('#export-columns-container input[type="checkbox"]')).every(cb => cb.checked);
            toggleAllCheckbox.checked = allChecked;
            toggleAllLabel.textContent = allChecked ? 'Desmarcar todas' : 'Seleccionar todas';
        };

        toggleAllCheckbox.onchange = () => {
            const checkboxes = document.querySelectorAll('#export-columns-container input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = toggleAllCheckbox.checked);
            updateToggleLabel();
        };

        // Update toggle label when individual checkboxes change
        document.querySelectorAll('#export-columns-container input[type="checkbox"]').forEach(cb => {
            cb.onchange = updateToggleLabel;
        });

        // Initial preview
        updateHeaderPreview();

        if (window.lucide) lucide.createIcons();
    }

    // ========================================
    // HELPER FUNCTIONS
    // ========================================

    function getQuestionsList() {
        const questions = [];
        if (!currentFormData?.pages) return questions;

        const pages = currentFormData.pages;
        let qIndex = 0;

        Object.keys(pages).sort().forEach(pageKey => {
            const page = pages[pageKey];
            if (!page.questions) return;

            Object.keys(page.questions).sort().forEach(qKey => {
                qIndex++;
                const q = page.questions[qKey];
                questions.push({
                    index: qIndex,
                    key: qKey,
                    pageKey: pageKey,
                    text: q.text || `Pregunta ${qIndex}`,
                    question: q
                });
            });
        });

        return questions;
    }

    function updateHeaderPreview() {
        const format = document.getElementById('export-header-format')?.value || 'title';
        const previewEl = document.getElementById('export-preview-headers');
        if (!previewEl) return;

        const questions = getQuestionsList().slice(0, 3); // Show first 3 as preview
        let preview = '<span class="export-preview-label">Vista previa:</span>';

        questions.forEach((q) => {
            let header = '';
            switch (format) {
                case 'number':
                    header = `Q${q.index}`;
                    break;
                case 'title':
                    header = q.text.length > 30 ? q.text.substring(0, 27) + '...' : q.text;
                    break;
                case 'numbered-title':
                    const title = q.text.length > 25 ? q.text.substring(0, 22) + '...' : q.text;
                    header = `${q.index}. ${title}`;
                    break;
            }
            preview += `<span class="export-preview-chip">${escHtml(header)}</span>`;
        });

        if (questions.length > 0) {
            preview += '<span class="export-preview-etc">...</span>';
        }

        previewEl.innerHTML = preview;
    }

    function selectAllColumns(selectAll) {
        const checkboxes = document.querySelectorAll('#export-columns-container input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = selectAll);
    }

    async function handleBrowseFolder() {
        try {
            const result = await window.bridgePy.send('browse_export_folder', {});
            if (result.success && result.path) {
                document.getElementById('export-path').value = result.path;
            }
        } catch (e) {
            console.error('[Export] Error browsing folder:', e);
        }
    }

    // ========================================
    // PROGRESS BAR
    // ========================================

    function showProgress() {
        const container = document.getElementById('export-progress-container');
        const footer = document.getElementById('export-modal-footer');
        if (container) container.style.display = 'block';
        if (footer) footer.style.display = 'none';
    }

    function hideProgress() {
        const container = document.getElementById('export-progress-container');
        const footer = document.getElementById('export-modal-footer');
        if (container) container.style.display = 'none';
        if (footer) footer.style.display = 'flex';
    }

    function updateProgress(current, total) {
        const bar = document.getElementById('export-progress-bar');
        if (!bar) return;

        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        bar.style.width = `${percent}%`;
        bar.textContent = `${percent}% (${current}/${total})`;
    }

    // ========================================
    // EXPORT LOGIC
    // ========================================

    async function handleExport() {
        // Validate inputs
        const filename = document.getElementById('export-filename')?.value?.trim();
        const outputPath = document.getElementById('export-path')?.value?.trim();

        if (!filename) {
            window.showAlert({
                icon: 'alert-triangle',
                title: 'Nombre Requerido',
                message: 'Por favor ingresa un nombre para el archivo.',
                confirmColor: 'bg-orange-500'
            });
            return;
        }

        if (!outputPath) {
            window.showAlert({
                icon: 'alert-triangle',
                title: 'Carpeta Requerida',
                message: 'Por favor selecciona una carpeta de destino.',
                confirmColor: 'bg-orange-500'
            });
            return;
        }

        // Get selected columns
        const selectedColumns = [];
        document.querySelectorAll('#export-columns-container input:checked').forEach(cb => {
            selectedColumns.push({
                index: parseInt(cb.value),
                name: cb.dataset.col
            });
        });

        // Get options
        const headerFormat = document.getElementById('export-header-format')?.value || 'title';
        const useAutomation = document.getElementById('export-use-automation')?.checked ?? true;
        const includeFilterStatus = document.getElementById('export-include-filter-status')?.checked ?? false;

        // Get automation config
        const automationConfig = currentFormData?.automationConfig || {};

        // Start export
        exportInProgress = true;
        showProgress();

        try {
            const exportData = await buildExportData({
                selectedColumns,
                headerFormat,
                useAutomation,
                includeFilterStatus,
                automationConfig
            });

            if (exportData.rows.length === 0) {
                hideProgress();
                exportInProgress = false;
                window.showAlert({
                    icon: 'info',
                    title: 'Sin Datos',
                    message: 'No hay filas que exportar con la configuración actual.',
                    confirmColor: 'bg-blue-500'
                });
                return;
            }

            // Send to backend
            const result = await window.bridgePy.send('export_form_responses', {
                filename: filename + '.xlsx',
                output_path: outputPath,
                headers: exportData.headers,
                rows: exportData.rows
            });

            hideProgress();
            exportInProgress = false;

            if (result.success) {
                close();
                window.showAlert({
                    icon: 'check-circle',
                    iconColor: 'text-green-500',
                    title: 'Exportación Exitosa',
                    message: `Archivo guardado en:\n${result.path}`,
                    confirmText: 'Aceptar',
                    confirmColor: 'bg-green-600 hover:bg-green-700'
                });
            } else {
                window.showAlert({
                    icon: 'x-circle',
                    iconColor: 'text-red-500',
                    title: 'Error de Exportación',
                    message: result.error || 'Error desconocido al exportar.',
                    confirmText: 'Cerrar',
                    confirmColor: 'bg-red-600 hover:bg-red-700'
                });
            }
        } catch (e) {
            console.error('[Export] Error:', e);
            hideProgress();
            exportInProgress = false;
            window.showAlert({
                icon: 'x-circle',
                iconColor: 'text-red-500',
                title: 'Error',
                message: 'Error durante la exportación: ' + e.message,
                confirmText: 'Cerrar',
                confirmColor: 'bg-red-600 hover:bg-red-700'
            });
        }
    }

    /**
     * Build export data by resolving placeholders for each row
     */
    async function buildExportData(options) {
        const {
            selectedColumns,
            headerFormat,
            useAutomation,
            includeFilterStatus,
            automationConfig
        } = options;

        const headers = window.globalHeaders || [];
        const excelData = window.globalExcelData || [];
        const questions = getQuestionsList();

        // Build output headers
        const outputHeaders = [];

        // 1. Selected columns from source Excel
        selectedColumns.forEach(col => {
            outputHeaders.push(col.name);
        });

        // 2. Question headers
        questions.forEach(q => {
            let header = '';
            switch (headerFormat) {
                case 'number':
                    header = `Q${q.index}`;
                    break;
                case 'title':
                    header = q.text;
                    break;
                case 'numbered-title':
                    header = `${q.index}. ${q.text}`;
                    break;
            }
            outputHeaders.push(header);
        });

        // 3. Filter status column (if enabled)
        if (includeFilterStatus) {
            outputHeaders.push('Estado Filtro');
        }

        // Get rows to process
        let rowsToProcess = [];
        const totalRows = excelData.length;

        // Parse range if using automation
        if (useAutomation && automationConfig.range) {
            rowsToProcess = parseRange(automationConfig.range, totalRows);
        } else {
            // All rows (0-indexed internally)
            for (let i = 0; i < totalRows; i++) {
                rowsToProcess.push(i);
            }
        }

        // Build output rows
        const outputRows = [];
        const filterConfig = automationConfig.filter;

        for (let idx = 0; idx < rowsToProcess.length; idx++) {
            const rowIndex = rowsToProcess[idx];
            const rowData = excelData[rowIndex];
            if (!rowData) continue;

            // Build selectedData object for this row
            const selectedData = {};
            headers.forEach((h, colIdx) => {
                selectedData[h] = rowData[colIdx] ?? '';
            });
            selectedData.rowIndex = rowIndex;
            selectedData.rowData = rowData;

            // Evaluate filter if using automation
            let filterPasses = true;
            let filterStatusText = '';

            if (useAutomation && filterConfig?.enabled) {
                filterPasses = evaluateFilterForExport(filterConfig, selectedData);
                filterStatusText = buildFilterStatusText(filterConfig, selectedData);
            }

            // Skip if filter doesn't pass and we're using automation
            if (useAutomation && filterConfig?.enabled && !filterPasses) {
                continue;
            }

            // Build row data
            const outputRow = [];

            // 1. Selected columns from source
            selectedColumns.forEach(col => {
                outputRow.push(rowData[col.index] ?? '');
            });

            // 2. Resolved question answers
            questions.forEach(q => {
                const resolvedValue = resolveValueForExport(q.question, selectedData);
                outputRow.push(resolvedValue);
            });

            // 3. Filter status (if enabled)
            if (includeFilterStatus) {
                outputRow.push(filterStatusText || 'N/A');
            }

            outputRows.push(outputRow);

            // Update progress
            updateProgress(idx + 1, rowsToProcess.length);

            // Yield to UI every 50 rows
            if (idx % 50 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        return {
            headers: outputHeaders,
            rows: outputRows
        };
    }

    /**
     * Parse range string (e.g., "1-10", "2,5,8") into array of 0-indexed row indices
     */
    function parseRange(rangeStr, totalRows) {
        if (!rangeStr || !rangeStr.trim()) {
            // Empty = all rows
            const all = [];
            for (let i = 0; i < totalRows; i++) all.push(i);
            return all;
        }

        const result = new Set();
        const parts = rangeStr.split(',');

        parts.forEach(part => {
            part = part.trim();
            if (part.includes('-')) {
                // Range: "3-10"
                const [start, end] = part.split('-').map(s => parseInt(s.trim()));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.max(1, start); i <= Math.min(totalRows, end); i++) {
                        result.add(i - 1); // Convert to 0-indexed
                    }
                }
            } else {
                // Single number
                const num = parseInt(part);
                if (!isNaN(num) && num >= 1 && num <= totalRows) {
                    result.add(num - 1); // Convert to 0-indexed
                }
            }
        });

        return Array.from(result).sort((a, b) => a - b);
    }

    /**
     * Evaluate filter conditions for export (copy of logic from autoform_view)
     */
    function evaluateFilterForExport(filterConfig, selectedData) {
        if (!filterConfig || !filterConfig.enabled) return true;
        if (!selectedData) return true;

        const conditions = filterConfig.conditions;
        if (!Array.isArray(conditions) || conditions.length === 0) return true;

        // Group by OR logic
        const orGroups = [];
        let currentGroup = [];

        for (const cond of conditions) {
            if (cond.logic === 'OR' && currentGroup.length > 0) {
                orGroups.push([...currentGroup]);
                currentGroup = [cond];
            } else {
                currentGroup.push(cond);
            }
        }
        if (currentGroup.length > 0) {
            orGroups.push(currentGroup);
        }

        return orGroups.some(group =>
            group.every(cond => evaluateSingleCondition(cond, selectedData))
        );
    }

    function evaluateSingleCondition(condition, selectedData) {
        const colMatch = condition.column?.match(/\{([^{}]+)\}/);
        if (!colMatch) return true;

        const columnName = colMatch[1].trim();
        const cellValue = selectedData[columnName] ?? '';
        const filterValue = condition.value || '';
        const operator = condition.operator || 'equals';

        const cellStr = String(cellValue).toLowerCase().trim();
        const filterStr = String(filterValue).toLowerCase().trim();

        switch (operator) {
            case 'equals': return cellStr === filterStr;
            case 'notEquals': return cellStr !== filterStr;
            case 'contains': return cellStr.includes(filterStr);
            case 'startsWith': return cellStr.startsWith(filterStr);
            default: return true;
        }
    }

    /**
     * Build filter status text for column
     */
    function buildFilterStatusText(filterConfig, selectedData) {
        if (!filterConfig?.conditions) return '';

        const parts = [];
        filterConfig.conditions.forEach(cond => {
            const colMatch = cond.column?.match(/\{([^{}]+)\}/);
            if (!colMatch) return;

            const colName = colMatch[1].trim();
            const value = selectedData[colName] ?? '';
            const prefix = cond.logic !== 'IF' ? ` ${cond.logic} ` : '';
            parts.push(`${prefix}${colName}=${value}`);
        });

        return parts.join('').trim();
    }

    /**
     * Resolve value for a question (simplified version for export)
     */
    function resolveValueForExport(question, selectedData) {
        // Check if mapping is enabled
        if (question.config?.mapping?.enabled) {
            const mapping = question.config.mapping;
            const placeholder = mapping.placeholder || '';
            const map = mapping.map || {};

            // Get column value
            const colMatch = placeholder.match(/\{([^{}]+)\}/);
            if (colMatch) {
                const colName = colMatch[1].trim();
                const colValue = selectedData[colName] ?? '';
                const colStr = String(colValue).trim();

                // Look up in mapping
                let mappedText = map[colStr] ?? null;
                if (mappedText === null) {
                    const foundKey = Object.keys(map).find(k => String(k).trim() === colStr);
                    if (foundKey) mappedText = map[foundKey];
                }

                if (mappedText !== null) {
                    return resolveAllPlaceholdersForExport(mappedText, selectedData);
                }

                // Use default value if no match
                if (mapping.defaultValue) {
                    return resolveAllPlaceholdersForExport(mapping.defaultValue, selectedData);
                }
            }
        }

        // Standard: resolve placeholders in response
        return resolveAllPlaceholdersForExport(question.response || '', selectedData);
    }

    /**
     * Resolve all placeholders for export
     */
    function resolveAllPlaceholdersForExport(text, selectedData) {
        if (!text) return '';
        let result = text;

        // Resolve [[Concept]] placeholders
        result = result.replace(/\[\[([^\[\]]+)\]\]/g, (match, name) => {
            const content = getConceptContentForExport(name.trim());
            return content !== null ? content : match;
        });

        // Resolve {Column} placeholders
        result = result.replace(/\{([^{}]+)\}/g, (match, col) => {
            const val = selectedData?.[col.trim()];
            return val !== undefined && val !== '' ? val : '';
        });

        return result;
    }

    /**
     * Get concept content for export
     */
    function getConceptContentForExport(conceptName) {
        const conceptsTab = window.projectData?.tabs?.find(t => t.type === 'concepts');
        if (!conceptsTab?.content?.tabs) return null;

        const tab = conceptsTab.content.tabs.find(t =>
            t.title?.toLowerCase() === conceptName.toLowerCase()
        );
        if (!tab) return null;

        return tab.content || '';
    }

    // ========================================
    // EXPOSE TO GLOBAL
    // ========================================

    window.ExportModal = {
        open,
        close
    };

})();
