/**
 * SheetViewModule - Excel Viewer
 * Wrapper for the ExcelViewer library component
 * Now with efficient sheet switching (uses cache, no re-parsing)
 */
const SheetViewModule = (function () {
    'use strict';

    let viewer = null;
    let currentData = null; // { headers: [{name, letter, index}], data: [[row]], filename... }
    let currentFilePath = null;
    let isFullyCached = false;

    let gridWrapper = null;
    let emptyState = null;
    let fileNameEl = null;

    function init() {
        gridWrapper = document.getElementById('grid-wrapper');
        emptyState = document.getElementById('empty-state');
        fileNameEl = document.getElementById('file-name');

        const importBtn = document.getElementById('import-excel-btn');
        if (importBtn) {
            importBtn.addEventListener('click', handleImportClick);
        }

        const reloadBtn = document.getElementById('reload-excel-btn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', handleReloadClick);
        }

        if (window.bridgePy) {
            window.bridgePy.on('excel_meta', handleExcelMeta);
            window.bridgePy.on('excel_data', handleExcelData);
            window.bridgePy.on('excel_error', handleExcelError);
            window.bridgePy.on('excel_cache_ready', handleCacheReady);
        }
    }

    async function handleImportClick() {
        bridgePy.setStatus('loader', 'Seleccionando...');
        try {
            const res = await bridgePy.browseAndParseExcel();
            if (res.cancelled) bridgePy.setStatus('check', 'Cancelado');
            else if (res.status === 'processing') bridgePy.setStatus('loader', 'Procesando...');
        } catch (e) {
            console.error('[SheetView] Import error:', e);
            bridgePy.setStatus('alert-circle', 'Error');
        }
    }

    /**
     * Reload current Excel file from disk
     */
    async function handleReloadClick() {
        if (!currentFilePath) {
            console.warn('[SheetView] No file to reload');
            return;
        }

        bridgePy.setStatus('loader', 'Recargando...');
        isFullyCached = false;

        try {
            await bridgePy.send('excel_reload', {});
        } catch (e) {
            console.error('[SheetView] Reload error:', e);
            bridgePy.setStatus('alert-circle', 'Error');
        }
    }

    function handleExcelMeta(meta) {
        console.log('[SheetView] Metadata:', meta);
        bridgePy.setStatus('loader', `Cargando ${meta.filename}...`);

        currentFilePath = meta.path;
        isFullyCached = meta.fromCache || false;

        if (fileNameEl) {
            fileNameEl.textContent = meta.filename;
            fileNameEl.classList.remove('hidden');
        }

        // Show reload button when file is loaded
        const reloadBtn = document.getElementById('reload-excel-btn');
        if (reloadBtn) {
            reloadBtn.classList.remove('hidden');
        }

        bridgePy.updateFooterExcel(meta.filename, 'Wait...');

        // Hide external tabs from old implementation
        const extTabs = document.getElementById('sheet-tabs');
        if (extTabs) extTabs.classList.add('hidden');
    }

    function handleExcelData(data) {
        console.log('[SheetView] Data:', data.rowCount, 'rows', data.fromCache ? '(from cache)' : '');
        renderExcel(data);
        bridgePy.setStatus('check', 'Excel cargado');

        // Trigger autosave when Excel data changes
        if (window.triggerAutoSave) {
            // Store Excel data in projectData for autosave
            window.projectData.excel = {
                path: currentFilePath,
                filename: data.filename,
                sheets: data.sheets,
                activeSheet: data.activeSheet
            };

            // If fully cached, store the cached data for project save
            if (isFullyCached) {
                window.projectData.excel.cachedData = window.projectData.excel.cachedData || {};
            }
        }
    }

    function handleCacheReady(info) {
        console.log('[SheetView] All sheets cached:', info.sheets.length, 'sheets');
        isFullyCached = true;

        // Update project data with cache status and trigger autosave
        if (window.bridgePy && window.triggerAutoSave) {
            // Get the full cache from backend for project save
            bridgePy.send('excel_get_cache', {}).then(cacheData => {
                if (cacheData && cacheData.cachedData) {
                    window.projectData.excel = cacheData;
                    console.log('[SheetView] Project excel data updated with cache');
                    window.triggerAutoSave();
                }
            }).catch(e => {
                console.error('[SheetView] Failed to get cache:', e);
            });
        }
    }

    function handleExcelError(err) {
        console.error('[SheetView] Error:', err);
        bridgePy.setStatus('alert-circle', 'Error backend');
        alert('Error: ' + (err.error || 'Unknown'));
    }

    function renderExcel(data) {
        if (!data || !data.data) return;
        currentData = data;

        if (fileNameEl) {
            fileNameEl.textContent = data.filename;
            fileNameEl.classList.remove('hidden');
        }
        bridgePy.updateFooterExcel(data.filename, data.rowCount);

        // Always recreate viewer to ensure tabs update for new files
        gridWrapper.innerHTML = '';
        viewer = new ExcelViewer(gridWrapper, {
            data: data,
            rowHeight: 26,
            onSelection: handleRowSelection,
            onSheetChange: handleSheetChange
        });

        gridWrapper.classList.remove('hidden');
        emptyState.classList.add('hidden');

        // GLOBAL STATE UPDATE
        // 1. globalHeaders: MUST be array of STRINGS for template_view.js validation
        window.globalHeaders = data.headers.map(h => h.name);

        // 2. globalExcelData: Raw data
        window.globalExcelData = data.data;

        // 3. Restore selection from projectData if available
        if (window.projectData?.excel?.selectedRow !== undefined) {
            const row = window.projectData.excel.selectedRow;
            const col = window.projectData.excel.selectedCol;
            if (col >= 0) {
                viewer.selectCell(row, col, false); // emit=false (no autosave trigger)
            } else {
                viewer.selectRow(row, false); // emit=false
            }
        }
    }

    function handleRowSelection(e) {
        // e: { rowIndex, colIndex, rowData }
        // rowIndex is -1 for header row

        if (e.rowIndex === -1) {
            // Header row selected - RESET state (clear selected data)
            window.globalSelectedData = null;

            // Clear saved selection in project data
            if (window.projectData && window.projectData.excel) {
                window.projectData.excel.selectedRow = -1;
                window.projectData.excel.selectedCol = -1;
            }

            // Notify ALL template tabs to reset
            document.querySelectorAll('.tab-content').forEach(content => {
                if (content.updateView) {
                    content.updateView();
                }
            });

            // Directly notify AutoFormViewModule to reset
            if (typeof AutoFormViewModule !== 'undefined' && typeof AutoFormViewModule.onRowSelected === 'function') {
                AutoFormViewModule.onRowSelected(null);
            }
            return;
        }

        const rowData = e.rowData || [];

        // Build globalSelectedData as simple {HeaderName: Value} object
        window.globalSelectedData = {
            rowIndex: e.rowIndex,
            rowData: rowData
        };

        if (currentData && currentData.headers) {
            currentData.headers.forEach((h, i) => {
                if (h.name) {
                    window.globalSelectedData[h.name] = rowData[i] !== undefined ? rowData[i] : '';
                }
            });
        }

        // Save selection to projectData for autosave
        if (window.projectData && window.projectData.excel) {
            window.projectData.excel.selectedRow = e.rowIndex;
            window.projectData.excel.selectedCol = e.colIndex;
            // Trigger autosave (debounced)
            if (window.triggerAutoSave) window.triggerAutoSave();
        }

        // Notify ALL template tabs
        document.querySelectorAll('.tab-content').forEach(content => {
            if (content.updateView) {
                content.updateView();
            }
        });
    }

    /**
     * Handle sheet tab click - use cached data (no re-parsing)
     */
    async function handleSheetChange(sheetName) {
        if (!currentFilePath && !isFullyCached) {
            console.error('[SheetView] No file path for sheet switch');
            return;
        }

        bridgePy.setStatus('loader', `Cargando ${sheetName}...`);

        try {
            // Use switch_sheet which reads from cache (no re-parsing)
            await bridgePy.send('excel_switch_sheet', { sheet: sheetName });
        } catch (e) {
            console.error('[SheetView] Sheet change error:', e);
            bridgePy.setStatus('alert-circle', 'Error');
        }
    }

    return {
        init,
        getData: () => currentData,
        reload: handleReloadClick
    };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SheetViewModule.init());
} else {
    SheetViewModule.init();
}

window.SheetViewModule = SheetViewModule;
