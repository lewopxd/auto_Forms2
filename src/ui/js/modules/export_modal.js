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
                <div class="af-config-sec-title">Opciones de Datos</div>
                
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
            
            <!-- EXCEL OPTIONS -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Opciones de Excel</div>
                
                <div class="af-config-row" style="gap:8px; margin-bottom:8px; align-items:center;">
                    <span style="min-width:100px; font-size:12px;">Nombre hoja:</span>
                    <input type="text" id="export-sheet-name" class="af-config-input" 
                           style="flex:1;" value="${escHtml(window.projectData?.tabs?.find(t => t.id === currentTabId)?.title || 'Respuestas')}" placeholder="Respuestas">
                </div>
                
                <label class="export-option-row">
                    <input type="checkbox" id="export-as-table" class="af-checkbox-blue" checked>
                    <span>Crear como Tabla Excel</span>
                </label>
                
                <div class="af-config-row" style="gap:8px; margin-bottom:8px; margin-left:24px; align-items:center;" id="export-table-name-row">
                    <span style="min-width:80px; font-size:12px;">Nombre tabla:</span>
                    <input type="text" id="export-table-name" class="af-config-input" 
                           style="flex:1; max-width:150px;" value="Table_1" placeholder="Table_1">
                </div>
                
                <label class="export-option-row">
                    <input type="checkbox" id="export-truncate-text" class="af-checkbox-blue" checked>
                    <span>Recortar texto</span>
                    <span class="export-option-hint">(Altura fija, una línea)</span>
                </label>
                
                <label class="export-option-row">
                    <input type="checkbox" id="export-freeze-panes" class="af-checkbox-blue" checked>
                    <span>Congelar fila de encabezados</span>
                </label>
                
                <label class="export-option-row">
                    <input type="checkbox" id="export-auto-width" class="af-checkbox-blue" checked>
                    <span>Ancho de columnas automático</span>
                </label>
                
                <div class="af-config-row" style="gap:8px; margin-bottom:8px; margin-left:24px; align-items:center; display:none;" id="export-column-width-row">
                    <span style="min-width:80px; font-size:12px;">Ancho máx:</span>
                    <input type="number" id="export-column-width" class="af-config-input" 
                           style="width:70px;" value="30" min="10" max="100">
                    <span style="font-size:11px; color:#6b7280;">caracteres</span>
                </div>
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

        // Toggle table name row visibility based on "Create as Table" checkbox
        const tableCheckbox = body.querySelector('#export-as-table');
        const tableNameRow = body.querySelector('#export-table-name-row');
        if (tableCheckbox && tableNameRow) {
            tableCheckbox.onchange = () => {
                tableNameRow.style.display = tableCheckbox.checked ? 'flex' : 'none';
            };
        }

        // Toggle column width row visibility based on "Auto width" checkbox
        const autoWidthCheckbox = body.querySelector('#export-auto-width');
        const columnWidthRow = body.querySelector('#export-column-width-row');
        if (autoWidthCheckbox && columnWidthRow) {
            autoWidthCheckbox.onchange = () => {
                columnWidthRow.style.display = autoWidthCheckbox.checked ? 'none' : 'flex';
            };
        }

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

        // Get Excel options
        const sheetName = document.getElementById('export-sheet-name')?.value?.trim() || 'Respuestas';
        const createAsTable = document.getElementById('export-as-table')?.checked ?? true;
        const tableName = document.getElementById('export-table-name')?.value?.trim() || 'Table_1';
        const truncateText = document.getElementById('export-truncate-text')?.checked ?? true;
        const freezePanes = document.getElementById('export-freeze-panes')?.checked ?? true;
        const autoWidth = document.getElementById('export-auto-width')?.checked ?? true;
        const columnWidth = parseInt(document.getElementById('export-column-width')?.value) || 30;

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

            // Send to backend with Excel options
            const result = await window.bridgePy.send('export_form_responses', {
                filename: filename + '.xlsx',
                output_path: outputPath,
                headers: exportData.headers,
                rows: exportData.rows,
                options: {
                    sheetName,
                    createAsTable,
                    tableName,
                    wrapText: !truncateText,  // Inverted: truncate = no wrap
                    freezePanes,
                    autoWidth,
                    columnWidth: autoWidth ? 50 : columnWidth  // Default max if auto
                }
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
            // Improved error logging
            console.error('[Export] Error:', e);
            if (e && e.stack) console.error('[Export] Stack:', e.stack);

            hideProgress();
            exportInProgress = false;

            // Build error message from various sources
            let errorMsg = 'Error desconocido';
            if (e?.message) {
                errorMsg = e.message;
            } else if (typeof e === 'string') {
                errorMsg = e;
            } else if (e?.error) {
                errorMsg = e.error;
            } else if (e) {
                errorMsg = JSON.stringify(e);
            }

            window.showAlert({
                icon: 'x-circle',
                iconColor: 'text-red-500',
                title: 'Error',
                message: 'Error durante la exportación: ' + errorMsg,
                confirmText: 'Cerrar',
                confirmColor: 'bg-red-600 hover:bg-red-700'
            });
        }
    }

    /**
     * Build export data using AutoFormViewModule.buildRowDataForExport()
     * This guarantees exported data matches EXACTLY what is shown in tarjetas
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

        // Get first resolved row to determine question order (same order as tarjetas)
        // We need to build headers from the first row's questions
        const firstRowData = buildSelectedDataFromRow(headers, excelData[0] || [], 0);
        const sampleResolvedRow = window.AutoFormViewModule?.buildRowDataForExport?.(currentTabId, firstRowData);

        if (!sampleResolvedRow || !sampleResolvedRow.questions) {
            throw new Error('No se pudo obtener estructura de preguntas. Verifica que la grabación esté cargada.');
        }

        // Build output headers using question order from resolved data
        const outputHeaders = [];

        // 1. Selected columns from source Excel
        selectedColumns.forEach(col => {
            outputHeaders.push(col.name);
        });

        // 2. Question headers (using SAME order as tarjetas)
        sampleResolvedRow.questions.forEach(q => {
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
        const errors = []; // Collect errors per row

        for (let idx = 0; idx < rowsToProcess.length; idx++) {
            const rowIndex = rowsToProcess[idx];
            const excelRowNum = rowIndex + 2; // Excel row number (1-indexed, +1 for header)
            const rawRowData = excelData[rowIndex];

            // Update progress IMMEDIATELY before processing
            updateProgress(idx + 1, rowsToProcess.length);

            // Yield to UI to display progress update
            await new Promise(r => setTimeout(r, 0));

            if (!rawRowData) continue;

            try {
                // Build selectedData object for this row
                const selectedData = buildSelectedDataFromRow(headers, rawRowData, rowIndex);

                // Use AutoFormViewModule to resolve values (SAME logic as tarjetas!)
                const resolvedRow = window.AutoFormViewModule?.buildRowDataForExport?.(currentTabId, selectedData);

                if (!resolvedRow) {
                    errors.push({ row: excelRowNum, error: 'No se pudo resolver la fila' });
                    continue;
                }

                // Skip if filter doesn't pass and we're using automation
                if (useAutomation && automationConfig.filter?.enabled && !resolvedRow.filterPasses) {
                    continue; // Skip filtered rows (not an error)
                }

                // Build row data
                const outputRow = [];

                // 1. Selected columns from source
                selectedColumns.forEach(col => {
                    outputRow.push(rawRowData[col.index] ?? '');
                });

                // 2. Resolved question answers (from the resolved row - SAME as tarjetas!)
                resolvedRow.questions.forEach(q => {
                    outputRow.push(q.resolvedValue ?? '');
                });

                // 3. Filter status (if enabled)
                if (includeFilterStatus) {
                    outputRow.push(resolvedRow.filterPasses ? 'PASS' : 'FAIL');
                }

                outputRows.push(outputRow);

            } catch (rowError) {
                console.error(`[Export] Error processing row ${excelRowNum}:`, rowError);
                errors.push({
                    row: excelRowNum,
                    error: rowError.message || String(rowError)
                });
            }
        }

        // If there were errors, throw to stop export
        if (errors.length > 0) {
            const errorDetails = errors.slice(0, 5).map(e => `Fila ${e.row}: ${e.error}`).join('\n');
            const moreText = errors.length > 5 ? `\n...y ${errors.length - 5} errores más` : '';
            throw new Error(`Error al procesar filas:\n${errorDetails}${moreText}`);
        }

        return {
            headers: outputHeaders,
            rows: outputRows
        };
    }

    /**
     * Helper: Build selectedData object from raw row array
     */
    function buildSelectedDataFromRow(headers, rawRowData, rowIndex) {
        const selectedData = {};
        headers.forEach((h, colIdx) => {
            selectedData[h] = rawRowData[colIdx] ?? '';
        });
        selectedData.rowIndex = rowIndex;
        selectedData.rowData = rawRowData;
        return selectedData;
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

    // ========================================
    // EXPOSE TO GLOBAL
    // ========================================

    window.ExportModal = {
        open,
        close
    };

})();
