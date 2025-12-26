/**
 * Automation Export Module
 * Exports .afpkg (AutoForm Package) for external Selenium scripts
 * 
 * The .afpkg contains:
 * - meta: Package metadata (version, source, counts)
 * - instructions: Selenium selectors, timing, strategies per question
 * - resolvedRows: Pre-resolved answers for each Excel row
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
        return `automation_${dateStr}_${timeStr}`;
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
                message: 'Debes cargar un archivo Excel antes de exportar para Selenium.',
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
        if (exportInProgress) return;

        const modal = document.getElementById('automation-export-modal-overlay');
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
        let el = document.getElementById('automation-export-modal-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'automation-export-modal-overlay';
            el.className = 'af-modal-overlay';
            el.innerHTML = `
                <div class="af-modal-window accent-purple" id="automation-export-modal-window" style="width: 480px;">
                    <div class="af-window-header">
                        <div class="af-window-title">
                            <i data-lucide="bot" class="w-5 h-5"></i>
                            <span>Exportar para Selenium</span>
                        </div>
                        <div class="af-window-close" id="automation-export-modal-close">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </div>
                    </div>
                    
                    <div class="af-window-body" id="automation-export-modal-body">
                        <!-- Dynamic Content -->
                    </div>
                    
                    <!-- Progress bar (hidden by default) -->
                    <div class="export-progress-container" id="automation-export-progress-container" style="display:none;">
                        <div class="export-progress-bar" id="automation-export-progress-bar"></div>
                    </div>
                    
                    <div class="af-window-footer" id="automation-export-modal-footer">
                        <div style="flex:1"></div>
                        <button class="af-btn-ghost" id="automation-export-btn-cancel">Cancelar</button>
                        <button class="af-btn-primary" id="automation-export-btn-export" style="background:#7c3aed;">
                            <i data-lucide="download" class="w-4 h-4"></i>
                            Exportar .afpkg
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
            el.querySelector('#automation-export-modal-close').onclick = close;
            el.querySelector('#automation-export-btn-cancel').onclick = close;
            el.querySelector('#automation-export-btn-export').onclick = handleExport;
        }
        return el;
    }

    async function renderModalContent(overlay) {
        const body = overlay.querySelector('#automation-export-modal-body');
        const excelFilename = window.globalExcelFilename || 'Sin archivo';
        const activeSheet = window.globalActiveSheet || 'Hoja 1';
        const totalRows = (window.globalExcelData || []).length;

        // Get default export path
        let defaultPath = '';
        try {
            const pathResult = await window.bridgePy.send('get_default_export_path', {});
            if (pathResult.success && pathResult.path) {
                defaultPath = pathResult.path;
            }
        } catch (e) {
            console.error('[AutomationExport] Error getting default path:', e);
        }

        // Calculate stats
        const stats = calculateStats();

        body.innerHTML = `
            <!-- SOURCE INFO -->
            <div class="af-config-section">
                <div class="af-config-sec-title">
                    <i data-lucide="file" class="w-4 h-4" style="display:inline-block;vertical-align:middle;margin-right:4px;"></i>
                    Fuente de Datos
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
                </div>
            </div>

            <!-- OUTPUT FILE -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Archivo de Salida</div>
                <div class="af-config-row" style="gap:8px;">
                    <input type="text" id="automation-export-filename" class="af-config-input" 
                           style="flex:1;" value="${generateDefaultFilename()}" placeholder="nombre_archivo">
                    <span class="text-xs text-gray-500">.afpkg</span>
                </div>
                <div class="af-config-row" style="gap:8px; margin-top:8px;">
                    <input type="text" id="automation-export-path" class="af-config-input" 
                           style="flex:1;" value="${escHtml(defaultPath)}" placeholder="Selecciona carpeta de destino..." readonly>
                    <button class="af-btn-ghost export-browse-btn" id="automation-export-browse-btn">
                        <i data-lucide="folder-open" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <!-- CONFIGURATION -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Configuración</div>
                <label class="export-option-row">
                    <input type="checkbox" id="automation-export-use-filters" class="af-checkbox-blue" checked>
                    <span>Usar configuración de filtros</span>
                    <span class="export-option-hint">(Si no está activo, se exportan todas las filas)</span>
                </label>
            </div>
            
            <!-- PREVIEW STATS -->
            <div class="af-config-section">
                <div class="af-config-sec-title">Vista Previa</div>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; padding:12px; background:#f8fafc; border-radius:8px;">
                    <div style="text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:#7c3aed;" id="automation-stat-rows">${stats.filteredRows}</div>
                        <div style="font-size:11px; color:#6b7280;">Filas a exportar</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:#0ea5e9;">${stats.questions}</div>
                        <div style="font-size:11px; color:#6b7280;">Preguntas</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:24px; font-weight:700; color:#10b981;">${stats.pages}</div>
                        <div style="font-size:11px; color:#6b7280;">Páginas</div>
                    </div>
                </div>
            </div>
        `;

        // Attach event handlers
        body.querySelector('#automation-export-browse-btn').onclick = handleBrowseFolder;

        // Update stats when filter checkbox changes
        body.querySelector('#automation-export-use-filters').onchange = () => {
            const newStats = calculateStats();
            const statEl = document.getElementById('automation-stat-rows');
            if (statEl) statEl.textContent = newStats.filteredRows;
        };

        if (window.lucide) lucide.createIcons();
    }

    // ========================================
    // STATS CALCULATION
    // ========================================

    function calculateStats() {
        const totalRows = (window.globalExcelData || []).length;
        const useFilters = document.getElementById('automation-export-use-filters')?.checked ?? true;

        // Count questions and pages
        let questions = 0;
        let pages = 0;

        if (currentFormData?.pages) {
            const pageKeys = Object.keys(currentFormData.pages);
            pages = pageKeys.filter(k => !k.includes('postSubmit')).length;

            pageKeys.forEach(pKey => {
                const page = currentFormData.pages[pKey];
                if (page.questions) {
                    questions += Object.keys(page.questions).length;
                }
            });
        }

        // Calculate filtered rows
        let filteredRows = totalRows;
        if (useFilters && currentFormData?.automationConfig) {
            const config = currentFormData.automationConfig;

            // Apply range filter
            if (config.range) {
                const rangeIndices = parseRange(config.range, totalRows);
                filteredRows = rangeIndices.length;
            }

            // Apply filter conditions (approximate count)
            if (config.filter?.enabled) {
                // For now, show total - exact count requires evaluating each row
                // This is just an estimate
            }
        }

        return { totalRows, filteredRows, questions, pages };
    }

    // ========================================
    // HELPER FUNCTIONS
    // ========================================

    async function handleBrowseFolder() {
        try {
            const result = await window.bridgePy.send('browse_export_folder', {});
            if (result.success && result.path) {
                document.getElementById('automation-export-path').value = result.path;
            }
        } catch (e) {
            console.error('[AutomationExport] Error browsing folder:', e);
        }
    }

    function parseRange(rangeStr, totalRows) {
        if (!rangeStr || !rangeStr.trim()) {
            const all = [];
            for (let i = 0; i < totalRows; i++) all.push(i);
            return all;
        }

        const result = new Set();
        const parts = rangeStr.split(',');

        parts.forEach(part => {
            part = part.trim();
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(s => parseInt(s.trim()) - 1);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.max(0, start); i <= Math.min(end, totalRows - 1); i++) {
                        result.add(i);
                    }
                }
            } else {
                const idx = parseInt(part) - 1;
                if (!isNaN(idx) && idx >= 0 && idx < totalRows) {
                    result.add(idx);
                }
            }
        });

        return Array.from(result).sort((a, b) => a - b);
    }

    // ========================================
    // PROGRESS BAR
    // ========================================

    function showProgress() {
        const container = document.getElementById('automation-export-progress-container');
        const footer = document.getElementById('automation-export-modal-footer');
        if (container) container.style.display = 'block';
        if (footer) footer.style.display = 'none';
    }

    function hideProgress() {
        const container = document.getElementById('automation-export-progress-container');
        const footer = document.getElementById('automation-export-modal-footer');
        if (container) container.style.display = 'none';
        if (footer) footer.style.display = 'flex';
    }

    function updateProgress(current, total) {
        const bar = document.getElementById('automation-export-progress-bar');
        if (!bar) return;

        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        bar.style.width = `${percent}%`;
        bar.textContent = `${percent}% (${current}/${total})`;
    }

    // ========================================
    // BUILD PACKAGE FUNCTIONS
    // ========================================

    /**
     * Build complete .afpkg package
     */
    function buildAutomationPackage(tabId, options) {
        return {
            meta: buildMeta(tabId, options),
            instructions: getInstructionSet(tabId),
            resolvedRows: getResolvedRows(tabId, options)
        };
    }

    /**
     * Build meta section
     */
    function buildMeta(tabId, options) {
        const tabInfo = window.projectData?.tabs?.find(t => t.id === tabId);
        const excelData = window.globalExcelData || [];

        return {
            version: '1.0',
            generatedAt: new Date().toISOString(),
            sourceExcel: window.globalExcelFilename || '',
            sourceSheet: window.globalActiveSheet || '',
            totalRows: excelData.length,
            exportedRows: options.exportedRowCount || 0,
            tabName: tabInfo?.title || 'Sin nombre'
        };
    }

    /**
     * Extract instructions from recording + card configs
     * Combines recording.data.pages with cards[].config (timing, strategy, validation)
     */
    function getInstructionSet(tabId) {
        const tabData = window.AutoFormViewModule?.getTabData?.(tabId);
        const formData = tabData?.formData;

        if (!formData || !formData.pages) {
            return { url: '', pages: [], postSubmit: null };
        }

        const cards = formData.cards || [];
        const pages = formData.pages;

        // Sort page keys (page_1, page_2, etc.)
        const sortedPageKeys = Object.keys(pages).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
        });

        // Filter out postSubmit page for main pages array
        const mainPageKeys = sortedPageKeys.filter(k => !k.includes('postSubmit'));

        const instructionPages = mainPageKeys.map(pKey => {
            const page = pages[pKey];
            const questionKeys = Object.keys(page.questions || {}).sort((a, b) => {
                const numA = parseInt(a.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.replace(/\D/g, '')) || 0;
                return numA - numB;
            });

            const questions = questionKeys.map(qKey => {
                const q = page.questions[qKey];
                // Find card config for this question
                const card = cards.find(c => c.questionKey === qKey);
                const cardConfig = card?.config || {};

                return {
                    key: qKey,
                    text: q.text || '',
                    type: q.type || 'text',
                    selenium: q.selenium || null,
                    options: (q.options || []).map(opt => ({
                        value: opt.value || opt.text || '',
                        selenium: opt.selenium || null,
                        isBranch: opt.isBranch || false
                    })),
                    timing: cardConfig.timing || null,
                    strategy: cardConfig.strategy || null,
                    validation: cardConfig.validation || null
                };
            });

            return {
                pageKey: pKey,
                pageNumber: page.pageInfo?.current || null,
                questions: questions,
                navigation: page.navigation || null
            };
        });

        // Extract postSubmit if exists
        let postSubmit = null;
        const postSubmitPage = pages['page_postSubmit'];
        if (postSubmitPage?.postSubmitActions) {
            postSubmit = postSubmitPage.postSubmitActions;
        }

        return {
            url: formData.url || '',
            pages: instructionPages,
            postSubmit: postSubmit
        };
    }

    /**
     * Get resolved rows using same logic as export modal
     * Reuses AutoFormViewModule.buildRowDataForExport()
     */
    function getResolvedRows(tabId, options) {
        const headers = window.globalHeaders || [];
        const excelData = window.globalExcelData || [];
        const useFilters = options.useFilters;
        const automationConfig = currentFormData?.automationConfig || {};

        const totalRows = excelData.length;
        let rowsToProcess = [];

        // Parse range if using filters
        if (useFilters && automationConfig.range) {
            rowsToProcess = parseRange(automationConfig.range, totalRows);
        } else {
            for (let i = 0; i < totalRows; i++) rowsToProcess.push(i);
        }

        const resolvedRows = [];

        for (let idx = 0; idx < rowsToProcess.length; idx++) {
            const rowIndex = rowsToProcess[idx];
            const excelRowNum = rowIndex + 2; // Excel row number (1-indexed + header)
            const rawRowData = excelData[rowIndex];

            if (!rawRowData) continue;

            // Build selectedData object for this row
            const selectedData = {};
            headers.forEach((h, colIdx) => {
                selectedData[h] = rawRowData[colIdx] ?? '';
            });
            selectedData.rowIndex = rowIndex;
            selectedData.rowData = rawRowData;

            // Use AutoFormViewModule to resolve values
            const resolvedRow = window.AutoFormViewModule?.buildRowDataForExport?.(tabId, selectedData);

            if (!resolvedRow) continue;

            // Skip if filter doesn't pass and we're using filters
            if (useFilters && automationConfig.filter?.enabled && !resolvedRow.filterPasses) {
                continue;
            }

            // Build answers object
            const answers = {};
            (resolvedRow.questions || []).forEach(q => {
                answers[q.key] = q.resolvedValue ?? '';
            });

            resolvedRows.push({
                rowIndex: rowIndex,
                excelRow: excelRowNum,
                answers: answers
            });

            // Update progress
            updateProgress(idx + 1, rowsToProcess.length);
        }

        return resolvedRows;
    }

    // ========================================
    // EXPORT LOGIC
    // ========================================

    async function handleExport() {
        // Validate inputs
        const filename = document.getElementById('automation-export-filename')?.value?.trim();
        const outputPath = document.getElementById('automation-export-path')?.value?.trim();

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

        const useFilters = document.getElementById('automation-export-use-filters')?.checked ?? true;

        // Start export
        exportInProgress = true;
        showProgress();

        try {
            // Build the package
            const options = { useFilters, exportedRowCount: 0 };

            // First pass: get resolved rows and count
            const resolvedRows = getResolvedRows(currentTabId, options);
            options.exportedRowCount = resolvedRows.length;

            if (resolvedRows.length === 0) {
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

            // Build complete package
            const pkg = {
                meta: buildMeta(currentTabId, options),
                instructions: getInstructionSet(currentTabId),
                resolvedRows: resolvedRows
            };

            // Send to backend
            const result = await window.bridgePy.send('export_automation_package', {
                filename: filename + '.afpkg',
                output_path: outputPath,
                package: pkg
            });

            hideProgress();
            exportInProgress = false;

            if (result.success) {
                close();
                window.showAlert({
                    icon: 'check-circle',
                    iconColor: 'text-green-500',
                    title: 'Exportación Exitosa',
                    message: `Paquete de automatización guardado en:\n${result.path}`,
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
            console.error('[AutomationExport] Error:', e);
            hideProgress();
            exportInProgress = false;

            let errorMsg = 'Error desconocido';
            if (e?.message) errorMsg = e.message;
            else if (typeof e === 'string') errorMsg = e;
            else if (e?.error) errorMsg = e.error;

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

    // ========================================
    // EXPOSE TO GLOBAL
    // ========================================

    window.AutomationExportModal = {
        open,
        close
    };

})();
