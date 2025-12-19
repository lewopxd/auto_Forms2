/* =====================================
   SHEET_VIEW.JS - Módulo del Visor Excel
   ===================================== */

const SheetViewModule = (function () {
    'use strict';

    // === ESTADO INTERNO ===
    let currentWorkbook = null;
    let currentSheetJson = [];
    let showCheckColumn = false;
    let checkColumnData = {}; // { rowIndex: 'true' | 'false' | '' }

    // === REFERENCIAS DOM ===
    const fileInput = document.getElementById('excel-upload');
    const fileNameEl = document.getElementById('file-name');
    const emptyState = document.getElementById('empty-state');
    const gridWrapper = document.getElementById('grid-wrapper');
    const sheetTabsEl = document.getElementById('sheet-tabs');

    // === CONFIG MENU ===
    let configMenuOpen = false;

    /**
     * Crea e inserta el botón de configuración
     */
    function createConfigButton() {
        const navRight = document.querySelector('#left-panel nav .flex.items-center.gap-3');
        if (!navRight || document.getElementById('config-menu-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.id = 'config-menu-wrapper';
        wrapper.className = 'config-menu-wrapper';
        wrapper.innerHTML = `
            <button class="config-btn" id="config-btn" title="Configuración">
                <i data-lucide="settings" class="w-4 h-4"></i>
            </button>
            <div class="config-menu" id="config-menu">
                <div class="config-menu-header">Opciones de Vista</div>
                <div class="config-menu-item" id="toggle-check-col">
                    <div class="config-menu-label">
                        <i data-lucide="check-square" class="w-4 h-4"></i>
                        <span>Show Check Column</span>
                    </div>
                    <div class="toggle-switch" id="check-col-toggle"></div>
                </div>
            </div>
        `;

        // Insert before the import button
        const importLabel = navRight.querySelector('label');
        navRight.insertBefore(wrapper, importLabel);

        // Setup event listeners
        const configBtn = document.getElementById('config-btn');
        const configMenu = document.getElementById('config-menu');
        const toggleItem = document.getElementById('toggle-check-col');
        const toggleSwitch = document.getElementById('check-col-toggle');

        configBtn.onclick = (e) => {
            e.stopPropagation();
            configMenuOpen = !configMenuOpen;
            configMenu.classList.toggle('open', configMenuOpen);
            configBtn.classList.toggle('active', configMenuOpen);
        };

        toggleItem.onclick = (e) => {
            e.stopPropagation();
            showCheckColumn = !showCheckColumn;
            toggleSwitch.classList.toggle('active', showCheckColumn);

            // Save to project data
            window.projectData.showCheckColumn = showCheckColumn;
            window.projectData.checkColumnData = checkColumnData;
            window.triggerAutoSave();

            // Re-render if we have data
            if (currentWorkbook) {
                const activeTab = document.querySelector('.sheet-tab.active');
                if (activeTab) {
                    renderSheet(activeTab.textContent);
                }
            }
        };

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                configMenuOpen = false;
                configMenu.classList.remove('open');
                configBtn.classList.remove('active');
            }
        });

        lucide.createIcons();
    }

    // === FUNCIONES PÚBLICAS ===

    /**
     * Maneja la carga de un archivo Excel
     */
    function handleExcelFile(file) {
        if (!file) return;

        window.projectData.excelFileName = file.name;
        fileNameEl.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            let binary = '';
            const len = data.byteLength;
            for (let i = 0; i < len; i++) {
                binary += String.fromCharCode(data[i]);
            }
            window.projectData.excelBase64 = btoa(binary);
            processExcelData(data);
            window.triggerAutoSave();
        };
        reader.readAsArrayBuffer(file);
    }

    /**
     * Procesa los datos del Excel y renderiza
     */
    function processExcelData(data) {
        try {
            currentWorkbook = XLSX.read(data, { type: 'array', cellStyles: true });
            emptyState.classList.add('hidden');
            gridWrapper.classList.remove('hidden');
            sheetTabsEl.classList.remove('hidden');
            renderSheetTabs(currentWorkbook.SheetNames);
            renderSheet(currentWorkbook.SheetNames[0]);
        } catch (error) {
            console.error('Error processing Excel:', error);
        }
    }

    /**
     * Renderiza las pestañas de hojas
     */
    function renderSheetTabs(names) {
        sheetTabsEl.innerHTML = '';
        names.forEach((name, index) => {
            const btn = document.createElement('button');
            btn.className = `sheet-tab ${index === 0 ? 'active' : ''}`;
            btn.textContent = name;
            btn.onclick = () => {
                renderSheet(name);
                document.querySelectorAll('.sheet-tab').forEach(x => x.classList.remove('active'));
                btn.classList.add('active');
            };
            sheetTabsEl.appendChild(btn);
        });
    }

    /**
     * Renderiza una hoja específica
     */
    function renderSheet(name) {
        const ws = currentWorkbook.Sheets[name];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        currentSheetJson = json;

        // Actualizar headers globales
        window.globalHeaders = json[0] ? json[0].map(x => String(x).trim()) : [];

        const tableClass = showCheckColumn ? 'excel-table has-check-col' : 'excel-table';

        // Build header row
        let headerHtml = `<table class="${tableClass}"><thead><tr>`;
        headerHtml += '<th class="row-num-header"></th>'; // Row number header

        if (showCheckColumn) {
            headerHtml += '<th class="check-col-header">✓</th>';
        }

        headerHtml += window.globalHeaders.map((h, i) => `<th>${getColumnLabel(i)}</th>`).join('');
        headerHtml += '</tr></thead><tbody>';

        // Build body rows
        json.forEach((row, idx) => {
            headerHtml += `<tr data-idx="${idx}" onclick="SheetViewModule.selectRow(this, ${idx})">`;
            headerHtml += `<td class="row-num-cell">${idx + 1}</td>`;

            if (showCheckColumn) {
                const checkValue = checkColumnData[idx] || '';
                headerHtml += `<td class="check-col-cell">`;
                if (idx === 0) {
                    // Header row - no select
                    headerHtml += '<span style="color:#7c3aed;font-weight:600;">☑</span>';
                } else {
                    headerHtml += `
                        <select class="check-select" 
                                onchange="SheetViewModule.setCheckValue(${idx}, this.value)" 
                                onclick="event.stopPropagation()">
                            <option value="" ${checkValue === '' ? 'selected' : ''}></option>
                            <option value="true" ${checkValue === 'true' ? 'selected' : ''}>✓</option>
                            <option value="false" ${checkValue === 'false' ? 'selected' : ''}>✗</option>
                        </select>
                    `;
                }
                headerHtml += '</td>';
            }

            headerHtml += row.map(cell => `<td>${cell ?? ''}</td>`).join('');
            headerHtml += '</tr>';
        });

        gridWrapper.innerHTML = headerHtml + '</tbody></table>';
    }

    /**
     * Establece el valor de check para una fila
     */
    function setCheckValue(rowIdx, value) {
        checkColumnData[rowIdx] = value;
        window.projectData.checkColumnData = checkColumnData;
        window.triggerAutoSave();
    }

    /**
     * Obtiene la etiqueta de columna (A, B, C... AA, AB...)
     */
    function getColumnLabel(index) {
        return (index >= 26 ? getColumnLabel(Math.floor(index / 26) - 1) : '') +
            String.fromCharCode(65 + index % 26);
    }

    /**
     * Selecciona una fila y actualiza los datos globales
     */
    function selectRow(tr, idx) {
        if (idx === 0) return; // No seleccionar header

        document.querySelectorAll('tr.selected-row').forEach(x => x.classList.remove('selected-row'));
        tr.classList.add('selected-row');

        window.globalSelectedData = {};
        currentSheetJson[idx].forEach((value, i) => {
            if (window.globalHeaders[i]) {
                window.globalSelectedData[window.globalHeaders[i]] = value;
            }
        });

        // Notificar a TODAS las pestañas de templates (no solo la activa)
        // Esto es necesario para que [[concepto]] se actualice correctamente
        document.querySelectorAll('.tab-content').forEach(content => {
            if (content.updateView) {
                content.updateView();
            }
        });
    }

    /**
     * Resetea el módulo (para nuevo proyecto)
     */
    function reset() {
        currentWorkbook = null;
        currentSheetJson = [];
        checkColumnData = {};
        showCheckColumn = false;

        // Reset toggle UI
        const toggleSwitch = document.getElementById('check-col-toggle');
        if (toggleSwitch) {
            toggleSwitch.classList.remove('active');
        }

        gridWrapper.classList.add('hidden');
        gridWrapper.innerHTML = '';
        emptyState.classList.remove('hidden');
        sheetTabsEl.classList.add('hidden');
        sheetTabsEl.innerHTML = '';
        fileNameEl.textContent = '';
    }

    /**
     * Restaura datos desde base64
     */
    function restoreFromBase64(base64, fileName) {
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            fileNameEl.textContent = fileName || "Recuperado";
            processExcelData(bytes);
            return true;
        } catch (err) {
            console.error('Error restoring Excel:', err);
            return false;
        }
    }

    /**
     * Restaura configuración desde proyecto
     */
    function restoreConfig(projectData) {
        if (projectData.showCheckColumn !== undefined) {
            showCheckColumn = projectData.showCheckColumn;
            const toggleSwitch = document.getElementById('check-col-toggle');
            if (toggleSwitch) {
                toggleSwitch.classList.toggle('active', showCheckColumn);
            }
        }
        if (projectData.checkColumnData) {
            checkColumnData = projectData.checkColumnData;
        }
    }

    // === INICIALIZACIÓN ===
    function init() {
        if (fileInput) {
            fileInput.addEventListener('change', (e) => handleExcelFile(e.target.files[0]));
        }
        createConfigButton();
    }

    // Auto-init cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // === API PÚBLICA ===
    return {
        handleExcelFile,
        processExcelData,
        selectRow,
        setCheckValue,
        reset,
        restoreFromBase64,
        restoreConfig
    };
})();

// Exponer globalmente para onclick en HTML
window.SheetViewModule = SheetViewModule;
