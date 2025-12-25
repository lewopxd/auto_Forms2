/* =====================================
   TEMPLATE_VIEW.JS - Módulo del Editor de Templates
   Soporta: Concepto (text) y Formulario (form)
   ===================================== */

const TemplateViewModule = (function () {
    'use strict';

    // === ESTADO INTERNO ===
    let tabCounter = 1;
    let pendingDeleteCallback = null;

    // === REFERENCIAS DOM ===
    const tabsContainerEl = document.getElementById('chrome-tabs-container');
    const contentArea = document.getElementById('tabs-content-area');
    const noTabsState = document.getElementById('no-tabs-state');

    // === FUNCIONES UTILITARIAS ===

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function generateId() {
        return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Limpia texto para copiar: quita espacios extra, capitaliza después de punto
     */
    function cleanTextForCopy(text) {
        if (!text) return '';
        return text
            .replace(/\r\n/g, '\n')           // Normaliza saltos de línea
            .replace(/[ \t]+/g, ' ')          // Múltiples espacios/tabs → uno solo
            .replace(/ ?\n ?/g, '\n')         // Espacios alrededor de newlines
            .replace(/\n{3,}/g, '\n\n')       // Máximo 2 newlines consecutivos
            .trim()                           // Espacios al inicio/final
            .replace(/([.!?])\s+([a-záéíóúñ])/gi, (m, punct, letter) => punct + ' ' + letter.toUpperCase()); // Mayúscula después de punto
    }

    /**
     * Obtiene el contenido procesado de una pestaña concepto por título
     * Compatible con tabs que no tienen type (creados antes del sistema de tipos)
     */
    function getConceptContent(conceptTitle) {
        if (!conceptTitle) return null;

        const searchTitle = conceptTitle.toLowerCase().trim();

        // Buscar tab: tipo 'concept' O sin tipo (compatibilidad) Y mismo título
        const tab = window.projectData.tabs.find(t => {
            const isConceptType = t.type === 'concept' || t.type === undefined || !t.type;
            const titleMatches = t.title && t.title.toLowerCase().trim() === searchTitle;
            return isConceptType && titleMatches && t.content !== undefined;
        });

        if (!tab) {
            console.warn(`[getConceptContent] Tab "${conceptTitle}" no encontrado. Tabs disponibles:`,
                window.projectData.tabs.map(t => ({ title: t.title, type: t.type }))
            );
            return null;
        }

        // Procesar placeholders {} del concepto
        return tab.content.replace(/\{([^{}]+)\}/g, (match, key) => {
            const trimmedKey = key.trim();
            if (window.globalSelectedData && window.globalSelectedData[trimmedKey] !== undefined) {
                return window.globalSelectedData[trimmedKey];
            }
            return match;
        });
    }

    /**
     * Procesa SOLO placeholders {} (columnas Excel) - usado para contenido de conceptos
     */
    function processColumnPlaceholders(text) {
        if (!text) return { html: '', error: false, warning: false };

        let error = false;
        let warning = false;
        let result = '';
        let lastIndex = 0;

        const regex = /\{([^{}]+)\}/g;
        let match;
        const headers = window.globalHeaders || [];

        while ((match = regex.exec(text)) !== null) {
            result += escapeHtml(text.substring(lastIndex, match.index));
            const trimmedKey = match[1].trim();

            if (!headers.includes(trimmedKey)) {
                error = true;
                result += `<span class="smart-chip smart-chip-error"><span class="line-through">${escapeHtml(trimmedKey)}</span><i data-lucide="alert-circle" class="smart-chip-icon"></i></span>`;
            } else if (window.globalSelectedData &&
                (window.globalSelectedData[trimmedKey] === "" ||
                    window.globalSelectedData[trimmedKey] === null ||
                    window.globalSelectedData[trimmedKey] === undefined)) {
                warning = true;
                result += `<span class="smart-chip smart-chip-warning">${escapeHtml(trimmedKey)}<i data-lucide="triangle-alert" class="smart-chip-icon"></i></span>`;
            } else {
                let val = "";
                let icon = "type";
                let chipClass = "smart-chip-value";

                if (window.globalSelectedData && window.globalSelectedData[trimmedKey] !== undefined) {
                    val = String(window.globalSelectedData[trimmedKey]);
                    if (!isNaN(parseFloat(val)) && isFinite(val)) icon = "hash";
                    else if (val.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/) || val.match(/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/)) icon = "calendar";
                } else {
                    val = trimmedKey;
                    icon = "columns";
                    chipClass = "smart-chip-field";
                }

                result += `<span class="smart-chip ${chipClass}">${escapeHtml(val)}<i data-lucide="${icon}" class="smart-chip-icon"></i></span>`;
            }

            lastIndex = regex.lastIndex;
        }

        result += escapeHtml(text.substring(lastIndex));
        return { html: result, error, warning };
    }

    /**
     * Procesa placeholders {} (Excel) y [[]] (Concepto)
     * IMPORTANTE: Procesar ANTES de escapar HTML
     */
    function processAllPlaceholders(text) {
        if (!text) return { html: '', error: false, warning: false };

        let error = false;
        let warning = false;
        let result = '';
        let lastIndex = 0;

        // Regex combinado: {$variable}, [[concepto]], {columna}
        // Groups: [1]={$...} with [2]=varName, [3]=[[...]] with [4]=conceptName, [5]={...} with [6]=colName
        const regex = /(\{\$([^{}]+)\})|(\[\[([^\[\]]+)\]\])|(\{([^{}]+)\})/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Agregar texto antes del match (escapado)
            result += escapeHtml(text.substring(lastIndex, match.index));

            if (match[1]) {
                // Es {$variable}
                const varName = match[2].trim();
                const isValid = window.VariablesModule?.isValidVariable(varName);

                if (!isValid) {
                    error = true;
                    result += `<span class="smart-chip smart-chip-error" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;"><span class="line-through">{$${escapeHtml(varName)}}</span><i data-lucide="alert-circle" class="smart-chip-icon"></i></span>`;
                } else {
                    // Resolve variable
                    const resolved = window.VariablesModule?.resolveVariable(varName, window.globalSelectedData);
                    if (resolved !== null && resolved !== undefined && resolved !== '') {
                        result += `<span class="smart-chip" style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%);border:1px solid #fbbf24;color:#92400e;">${escapeHtml(resolved)}<i data-lucide="variable" class="smart-chip-icon"></i></span>`;
                    } else if (window.globalSelectedData && Object.keys(window.globalSelectedData).length > 0) {
                        warning = true;
                        result += `<span class="smart-chip smart-chip-warning" style="background:#fef3c7;border-color:#fbbf24;color:#92400e;">{$${escapeHtml(varName)}}<i data-lucide="triangle-alert" class="smart-chip-icon"></i></span>`;
                    } else {
                        // No row selected, show pending
                        result += `<span class="smart-chip" style="background:#fef3c7;border:1px solid #fbbf24;color:#92400e;">{$${escapeHtml(varName)}}<i data-lucide="variable" class="smart-chip-icon"></i></span>`;
                    }
                }
            } else if (match[3]) {
                // Es [[concepto]]
                const conceptName = match[4].trim();
                const content = getConceptContent(conceptName);
                if (content === null) {
                    error = true;
                    result += `<span class="smart-chip smart-chip-concept" style="border-color:#fecaca;background:#fef2f2;color:#991b1b;"><span class="line-through">${escapeHtml(conceptName)}</span><i data-lucide="alert-circle" class="smart-chip-icon"></i></span>`;
                } else {
                    // Procesar placeholders DENTRO del contenido del concepto
                    // Usamos una función auxiliar para procesar solo {columnas} sin recursión infinita
                    const processedInner = processColumnPlaceholders(content);
                    if (processedInner.error) error = true;
                    if (processedInner.warning) warning = true;
                    result += processedInner.html;
                }
            } else if (match[5]) {
                // Es {columna}
                const trimmedKey = match[6].trim();
                const headers = window.globalHeaders || [];

                if (!headers.includes(trimmedKey)) {
                    error = true;
                    result += `<span class="smart-chip smart-chip-error"><span class="line-through">${escapeHtml(trimmedKey)}</span><i data-lucide="alert-circle" class="smart-chip-icon"></i></span>`;
                } else if (window.globalSelectedData &&
                    (window.globalSelectedData[trimmedKey] === "" ||
                        window.globalSelectedData[trimmedKey] === null ||
                        window.globalSelectedData[trimmedKey] === undefined)) {
                    warning = true;
                    result += `<span class="smart-chip smart-chip-warning">${escapeHtml(trimmedKey)}<i data-lucide="triangle-alert" class="smart-chip-icon"></i></span>`;
                } else {
                    let val = "";
                    let icon = "type";
                    let chipClass = "smart-chip-value";

                    if (window.globalSelectedData && window.globalSelectedData[trimmedKey] !== undefined) {
                        val = String(window.globalSelectedData[trimmedKey]);
                        if (!isNaN(parseFloat(val)) && isFinite(val)) icon = "hash";
                        else if (val.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/) || val.match(/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/)) icon = "calendar";
                    } else {
                        val = trimmedKey;
                        icon = "columns";
                        chipClass = "smart-chip-field";
                    }

                    result += `<span class="smart-chip ${chipClass}">${escapeHtml(val)}<i data-lucide="${icon}" class="smart-chip-icon"></i></span>`;
                }
            }

            lastIndex = regex.lastIndex;
        }

        // Agregar texto restante (escapado)
        result += escapeHtml(text.substring(lastIndex));

        setTimeout(() => lucide.createIcons(), 0);
        return { html: result, error, warning };
    }

    /**
     * Resalta placeholders en modo edición con validación en tiempo real
     * @param {string} text - Texto a procesar
     * @param {boolean} isConceptTab - Si es pestaña de concepto (bloquea [[]])
     * @returns {object} { html, hasConceptError }
     */
    function highlightPlaceholders(text, isConceptTab = false) {
        // Use PlaceholderEngine for highlighting
        const result = window.PlaceholderEngine.highlightForEdit(text, { isConceptTab });
        return { html: result.html, hasConceptError: result.hasError };
    }

    // === MODAL FUNCTIONS ===

    function openTabTypeModal() {
        document.getElementById('modal-tab-type').classList.add('open');
        lucide.createIcons();
    }

    function showDeleteConfirmation(callback) {
        pendingDeleteCallback = callback;
        document.getElementById('modal-confirm-delete').classList.add('open');
        document.getElementById('confirm-delete-btn').onclick = () => {
            window.closeModals();
            if (pendingDeleteCallback) {
                pendingDeleteCallback();
                pendingDeleteCallback = null;
            }
        };
    }

    // === TAB CREATION ===

    function createTab(type) {
        window.closeModals();
        if (type === 'concept') {
            createConceptTab();
        } else if (type === 'form') {
            createFormTab();
        } else if (type === 'autoform') {
            createAutoFormTab();
        }
    }

    function createTabElement(tabId, tabTitle, tabType) {
        const tabEl = document.createElement('div');
        tabEl.className = `chrome-tab tab-${tabType}`;
        tabEl.dataset.id = tabId;
        tabEl.dataset.type = tabType;

        const icon = tabType === 'concept' ? 'file-text' : tabType === 'form' ? 'list-checks' : 'bot';
        tabEl.innerHTML = `
            <i data-lucide="${icon}" class="w-4 h-4 tab-icon"></i>
            <span class="flex-1 truncate pointer-events-auto">${escapeHtml(tabTitle)}</span>
            <div class="chrome-tab-close"><i data-lucide="x" class="w-3 h-3"></i></div>
        `;

        const span = tabEl.querySelector('span');

        // Double-click to edit name
        span.ondblclick = (e) => {
            e.stopPropagation();
            const inp = document.createElement('input');
            const currentData = window.findTab(tabId);
            inp.value = currentData.title;
            inp.className = "tab-input-edit bg-white text-gray-900 text-xs px-2 py-1 rounded flex-1 min-w-0 outline-none border border-blue-300";
            inp.onclick = (e) => e.stopPropagation();
            inp.onmousedown = (e) => e.stopPropagation();
            inp.ondblclick = (e) => e.stopPropagation();

            const save = () => {
                const newTitle = inp.value.trim() || currentData.title;
                span.textContent = newTitle;
                const h3 = document.querySelector(`#content-${tabId} h3`);
                if (h3) h3.textContent = newTitle;
                inp.replaceWith(span);
                window.updateTab(tabId, { title: newTitle });
            };
            inp.onblur = save;
            inp.onkeydown = e => e.key === 'Enter' && save();
            span.replaceWith(inp);
            inp.focus();
            inp.select();
        };

        // Close tab
        tabEl.querySelector('.chrome-tab-close').onclick = (e) => {
            e.stopPropagation();
            window.projectData.tabs = window.projectData.tabs.filter(t => t.id !== tabId);
            tabEl.remove();
            document.getElementById(`content-${tabId}`)?.remove();
            if (window.projectData.tabs.length === 0) noTabsState.classList.remove('hidden');
            window.triggerAutoSave();
        };

        tabEl.onclick = (e) => {
            if (e.target.tagName !== 'INPUT') activateTab(tabId);
        };

        const addBtn = document.getElementById('add-tab-btn');
        tabsContainerEl.insertBefore(tabEl, addBtn);
        return tabEl;
    }

    // === CONCEPT TAB ===

    function createConceptTab(restoredData = null) {
        const tabId = restoredData?.id || generateId();
        const tabTitle = restoredData?.title || `Concepto ${tabCounter++}`;
        const initialContent = restoredData?.content || "";

        if (!restoredData) {
            window.projectData.tabs.push({ id: tabId, title: tabTitle, type: 'concept', content: initialContent });
            window.triggerAutoSave();
        }

        createTabElement(tabId, tabTitle, 'concept');

        const contentEl = document.createElement('div');
        contentEl.id = `content-${tabId}`;
        contentEl.className = 'tab-content';

        contentEl.innerHTML = `
            <div class="p-8 flex flex-col h-full">
                <div class="flex items-center gap-3 mb-6 group cursor-pointer w-fit hover:bg-gray-50 p-2 px-4 rounded-lg transition-all border border-transparent hover:border-gray-200" title="Clic para editar nombre">
                    <h3 class="text-3xl font-light text-gray-400 group-hover:text-gray-600 transition-colors select-none">${escapeHtml(tabTitle)}</h3>
                    <div class="text-gray-400 opacity-0 group-hover:opacity-100 transition-all"><i data-lucide="edit-3" class="w-5 h-5"></i></div>
                </div>
                <div class="flex flex-col flex-1 w-full h-full">
                    <div class="flex-1 w-full relative card-box border border-solid border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden" style="min-height: 200px;">
                        <div class="absolute top-3 right-3 z-20 flex gap-2">
                            <button class="copy-btn p-2 rounded-full bg-white shadow hover:bg-gray-100 text-gray-600 transition-all" title="Copiar texto limpio">
                                <i data-lucide="copy" class="w-4 h-4"></i>
                            </button>
                            <button class="toggle-mode p-2 rounded-full bg-white shadow hover:bg-gray-100 text-gray-600 transition-all" title="Cambiar Vista/Edición">
                                <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                        <div class="edit-container hidden absolute inset-0 p-6 pt-14 flex flex-col">
                            <div class="mb-2 text-xs font-semibold text-gray-400">MODO EDICIÓN</div>
                            <div class="editor-container flex-1 relative">
                                <div class="editor-backdrop"></div>
                                <textarea class="editor-textarea" placeholder="Escribe tu texto aquí. Usa {COLUMNA} para Excel o [[Concepto]] para referencias...">${escapeHtml(initialContent)}</textarea>
                            </div>
                        </div>
                        <div class="view-container absolute inset-0 p-6 pt-14 flex flex-col bg-white">
                            <div class="mb-2 text-xs font-semibold text-blue-500 flex-shrink-0">VISTA PREVIA</div>
                            <div class="view-content flex-1 text-sm select-text overflow-auto"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const titleWrapper = contentEl.querySelector('.group');
        const titleH3 = contentEl.querySelector('h3');
        const textarea = contentEl.querySelector('textarea');
        const backdrop = contentEl.querySelector('.editor-backdrop');
        const toggleBtn = contentEl.querySelector('.toggle-mode');
        const copyBtn = contentEl.querySelector('.copy-btn');
        const editCont = contentEl.querySelector('.edit-container');
        const viewCont = contentEl.querySelector('.view-container');
        const viewContent = contentEl.querySelector('.view-content');
        const cardBox = contentEl.querySelector('.card-box');

        // Create error message element for forbidden [[Concepts]]
        const errorMsgEl = document.createElement('div');
        errorMsgEl.className = 'concept-error-msg';
        errorMsgEl.style.cssText = 'display:none; color:#dc2626; font-size:11px; padding:6px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:4px; margin-top:8px;';
        errorMsgEl.innerHTML = '<i data-lucide="alert-triangle" style="width:12px;height:12px;display:inline;margin-right:4px;"></i> No se pueden usar [[Conceptos]] dentro de conceptos';

        // Function to update backdrop with validation
        const updateBackdrop = (text) => {
            const result = highlightPlaceholders(text, true); // isConceptTab = true
            backdrop.innerHTML = result.html;
            errorMsgEl.style.display = result.hasConceptError ? 'block' : 'none';
            if (result.hasConceptError && window.lucide) lucide.createIcons();
        };

        updateBackdrop(initialContent);

        // Insert error message after the editor container
        const editorContainer = contentEl.querySelector('.editor-container');
        if (editorContainer) {
            editorContainer.parentNode.insertBefore(errorMsgEl, editorContainer.nextSibling);
            if (window.lucide) lucide.createIcons();
        }

        // Title editing
        titleWrapper.onclick = (e) => {
            e.stopPropagation();
            const currentData = window.findTab(tabId);
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentData.title;
            input.className = 'text-3xl font-light text-gray-700 bg-transparent border-b-2 border-blue-500 outline-none min-w-[240px] mb-6 pb-1';

            const save = () => {
                const newName = input.value.trim() || currentData.title;
                titleH3.textContent = newName;
                document.querySelector(`.chrome-tab[data-id="${tabId}"] span`).textContent = newName;
                input.replaceWith(titleWrapper);
                window.updateTab(tabId, { title: newName });
            };
            input.onblur = save;
            input.onkeydown = (ev) => { if (ev.key === 'Enter') save(); };
            titleWrapper.replaceWith(input);
            input.focus();
            input.select();
        };

        textarea.oninput = () => {
            window.updateTab(tabId, { content: textarea.value });
            updateBackdrop(textarea.value);
            window.triggerAutoSave();
        };
        textarea.onscroll = () => { backdrop.scrollTop = textarea.scrollTop; };

        const updateView = () => {
            const res = processAllPlaceholders(textarea.value);
            viewContent.innerHTML = res.html.replace(/\n/g, '<br>');
            cardBox.classList.toggle('bg-red-50', res.error);
            cardBox.classList.toggle('border-red-200', res.error);
        };
        updateView();

        copyBtn.onclick = () => {
            let cleanText = textarea.value
                .replace(/\[\[([^\[\]]+)\]\]/g, (m, name) => getConceptContent(name.trim()) || m)
                .replace(/\{([^{}]+)\}/g, (m, k) => {
                    const key = k.trim();
                    return window.globalSelectedData?.[key] ?? m;
                })
                .replace(/\s+/g, ' ').trim();
            if (cleanText.length > 0) cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1);

            navigator.clipboard.writeText(cleanText).then(() => {
                copyBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-green-600"></i>';
                lucide.createIcons();
                setTimeout(() => { copyBtn.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i>'; lucide.createIcons(); }, 1500);
            });
        };

        let isEdit = false;
        toggleBtn.onclick = () => {
            isEdit = !isEdit;
            editCont.classList.toggle('hidden', !isEdit);
            viewCont.classList.toggle('hidden', isEdit);
            toggleBtn.innerHTML = isEdit ? '<i data-lucide="eye" class="w-4 h-4"></i>' : '<i data-lucide="edit-2" class="w-4 h-4"></i>';
            if (!isEdit) updateView();
            lucide.createIcons();
        };

        contentEl.updateView = updateView;
        contentArea.appendChild(contentEl);
        activateTab(tabId);
        lucide.createIcons();
    }

    // === AUTOFORM TAB ===

    function createAutoFormTab(restoredData = null) {
        const tabId = restoredData?.id || generateId();
        const tabTitle = restoredData?.title || `AutoForm ${tabCounter++}`;

        if (!restoredData) {
            window.projectData.tabs.push({
                id: tabId,
                title: tabTitle,
                type: 'autoform',
                cards: [],                  // Cards derived from a recording (belong to this tab)
                loadedRecordingId: null,    // Reference to global recording used to generate cards
                uiState: { mode: 'edit' }
            });
            window.triggerAutoSave();
        }

        createTabElement(tabId, tabTitle, 'autoform');

        // Use AutoFormViewModule to create content
        const contentEl = document.createElement('div');
        contentEl.id = `content-${tabId}`;
        contentEl.className = 'tab-content';

        if (typeof AutoFormViewModule !== 'undefined') {
            const autoformContent = AutoFormViewModule.createAutoFormContent(tabId, restoredData?.autoformData);
            contentEl.appendChild(autoformContent);

            // updateView for autoform: update previews when row selected
            contentEl.updateView = () => {
                if (typeof AutoFormViewModule.onRowSelected === 'function') {
                    AutoFormViewModule.onRowSelected(window.globalSelectedData);
                }
            };
        } else {
            contentEl.innerHTML = '<div class="p-8 text-gray-400">AutoFormViewModule not loaded</div>';
        }

        contentArea.appendChild(contentEl);
        activateTab(tabId);
        if (window.lucide) lucide.createIcons();
    }

    // === FORM TAB ===

    function createFormTab(restoredData = null) {
        const tabId = restoredData?.id || generateId();
        const tabTitle = restoredData?.title || `Formulario ${tabCounter++}`;
        const formLink = restoredData?.formLink || "";
        const questions = restoredData?.questions || [];

        if (!restoredData) {
            window.projectData.tabs.push({ id: tabId, title: tabTitle, type: 'form', formLink, questions });
            window.triggerAutoSave();
        }

        createTabElement(tabId, tabTitle, 'form');

        const contentEl = document.createElement('div');
        contentEl.id = `content-${tabId}`;
        contentEl.className = 'tab-content';

        // Using absolute positioning for edit/view modes to properly contain overflow
        contentEl.innerHTML = `
            <div class="form-container" style="position: relative;">
                <div class="form-header p-3 border-b flex items-center justify-between bg-gray-50 flex-shrink-0">
                    <div class="form-title-wrapper flex items-center gap-2 group cursor-pointer px-2 py-1 rounded hover:bg-gray-100 transition-all" title="Clic para editar">
                        <i data-lucide="list-checks" class="w-5 h-5 text-purple-500"></i>
                        <h3 class="form-title text-lg font-semibold text-gray-700">${escapeHtml(tabTitle)}</h3>
                        <i data-lucide="edit-3" class="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="export-btn" title="Exportar a Excel">
                            <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                            <span>Exportar</span>
                        </button>
                        <button class="toggle-mode p-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 transition-all flex items-center gap-2" title="Cambiar Vista/Edición">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                            <span class="text-sm font-medium">Vista</span>
                        </button>
                    </div>
                </div>
                <div class="form-body" style="position: absolute; top: 65px; left: 0; right: 0; bottom: 16px; overflow: hidden;">
                    <div class="edit-mode" style="position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden;">
                        <div class="form-link-header">
                            <i data-lucide="link" class="w-5 h-5 text-purple-500"></i>
                            <input type="url" class="form-link-input" placeholder="URL del formulario (Google Forms, MS Forms...)" value="${escapeHtml(formLink)}">
                        </div>
                        <div class="questions-container" id="questions-${tabId}" style="flex: 1; overflow-y: auto;">
                            <button class="add-question-btn" id="add-q-${tabId}">
                                <i data-lucide="plus" class="w-5 h-5"></i>
                                <span>Agregar Pregunta</span>
                            </button>
                        </div>
                    </div>
                    <div class="view-mode hidden" style="position: absolute; inset: 0; overflow-y: auto; padding: 24px; background: white;">
                        <div class="form-view-content" id="view-${tabId}"></div>
                    </div>
                </div>
            </div>
        `;

        const toggleBtn = contentEl.querySelector('.toggle-mode');
        const exportBtn = contentEl.querySelector('.export-btn');
        const editMode = contentEl.querySelector('.edit-mode');
        const viewMode = contentEl.querySelector('.view-mode');
        const linkInput = contentEl.querySelector('.form-link-input');
        const questionsContainer = contentEl.querySelector(`#questions-${tabId}`);
        const addQBtn = contentEl.querySelector(`#add-q-${tabId}`);
        const viewContainer = contentEl.querySelector(`#view-${tabId}`);
        const titleWrapper = contentEl.querySelector('.form-title-wrapper');
        const titleH3 = contentEl.querySelector('.form-title');

        // Export button handler
        exportBtn.onclick = () => openExportModal(tabId);

        // Editable title
        titleWrapper.onclick = (e) => {
            e.stopPropagation();
            const currentData = window.findTab(tabId);
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentData.title;
            input.className = 'text-lg font-semibold text-gray-700 bg-white border border-purple-300 rounded px-2 py-1 outline-none min-w-[200px]';

            const save = () => {
                const newName = input.value.trim() || currentData.title;
                titleH3.textContent = newName;
                document.querySelector(`.chrome-tab[data-id="${tabId}"] span`).textContent = newName;
                input.replaceWith(titleWrapper);
                window.updateTab(tabId, { title: newName });
            };
            input.onblur = save;
            input.onkeydown = (ev) => { if (ev.key === 'Enter') save(); };
            titleWrapper.replaceWith(input);
            input.focus();
            input.select();
        };

        linkInput.oninput = () => {
            window.updateTab(tabId, { formLink: linkInput.value });
            window.triggerAutoSave();
        };

        function getTabData() {
            return window.findTab(tabId);
        }

        function renderQuestions() {
            const tabData = getTabData();
            const existingCards = questionsContainer.querySelectorAll('.question-card');
            existingCards.forEach(c => c.remove());

            tabData.questions.forEach((q, idx) => {
                const isCollapsed = q.collapsed || false;
                const isSelectionType = q.answerType === 'single' || q.answerType === 'multiple';
                const options = q.options || [];

                const card = document.createElement('div');
                card.className = 'question-card' + (isCollapsed ? ' collapsed' : '');
                card.dataset.qid = q.id;

                // Build options HTML for selection types with actual selectable inputs
                let optionsHtml = '';
                if (isSelectionType) {
                    const selectedOpts = q.selectedOptions || [];
                    optionsHtml = `
                        <div class="question-options">
                            <label class="question-field-label">Opciones (selecciona la respuesta correcta)</label>
                            <div class="options-list">
                                ${options.map((opt, optIdx) => {
                        const isSelected = selectedOpts.includes(optIdx);
                        const inputType = q.answerType === 'single' ? 'radio' : 'checkbox';
                        const inputName = q.answerType === 'single' ? `opt-${q.id}` : `opt-${q.id}-${optIdx}`;
                        return `
                                        <div class="option-item" data-idx="${optIdx}">
                                            <input type="${inputType}" name="${inputName}" class="option-selector" data-idx="${optIdx}" ${isSelected ? 'checked' : ''}>
                                            <input type="text" class="option-input" value="${escapeHtml(opt)}" placeholder="Opción ${optIdx + 1}">
                                            <button class="option-delete" title="Eliminar opción"><i data-lucide="x" class="w-3 h-3"></i></button>
                                        </div>
                                    `;
                    }).join('')}
                            </div>
                            <button class="add-option-btn">
                                <i data-lucide="plus" class="w-3 h-3"></i>
                                <span>Agregar opción</span>
                            </button>
                        </div>
                    `;
                }

                card.innerHTML = `
                    <div class="question-card-header">
                        <div class="question-left">
                            <button class="question-collapse-btn" title="Colapsar/Expandir">
                                <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" class="w-4 h-4"></i>
                            </button>
                            <span class="question-number-badge">${idx + 1}</span>
                        </div>
                        <div class="question-right">
                            <select class="question-type-select">
                                <option value="text-short" ${q.answerType === 'text-short' ? 'selected' : ''}>Corto</option>
                                <option value="text-long" ${q.answerType === 'text-long' || q.answerType === 'text' ? 'selected' : ''}>Largo</option>
                                <option value="single" ${q.answerType === 'single' ? 'selected' : ''}>Única</option>
                                <option value="multiple" ${q.answerType === 'multiple' ? 'selected' : ''}>Múltiple</option>
                            </select>
                            <button class="question-delete-btn" title="Eliminar">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                    <div class="question-card-body" ${isCollapsed ? 'style="display:none;"' : ''}>
                        <input type="text" class="q-question-input" value="${escapeHtml(q.question)}" placeholder="Escribe la pregunta...">
                        ${isSelectionType ? optionsHtml : `
                            <div class="question-answer-field">
                                <label class="question-field-label">Respuesta</label>
                                <input type="text" class="q-answer-input" value="${escapeHtml(q.answer)}" placeholder="Usa {COL} o [[Concepto]]">
                            </div>
                        `}
                    </div>
                `;

                // Type change - re-render to update options UI
                card.querySelector('.question-type-select').onchange = (e) => {
                    q.answerType = e.target.value;
                    if (!q.options) q.options = [];
                    window.triggerAutoSave();
                    renderQuestions(); // Re-render to show/hide options
                };

                // Question input
                const questionInput = card.querySelector('.q-question-input');
                if (questionInput) {
                    questionInput.oninput = (e) => {
                        q.question = e.target.value;
                        window.triggerAutoSave();
                    };
                }

                // Answer input (only for text type)
                const answerInput = card.querySelector('.q-answer-input');
                if (answerInput) {
                    answerInput.oninput = (e) => {
                        q.answer = e.target.value;
                        window.triggerAutoSave();
                    };
                }

                // Options for selection types
                if (isSelectionType) {
                    // Option inputs
                    card.querySelectorAll('.option-input').forEach((input, optIdx) => {
                        input.oninput = (e) => {
                            q.options[optIdx] = e.target.value;
                            window.triggerAutoSave();
                        };
                    });

                    // Delete option buttons
                    card.querySelectorAll('.option-delete').forEach((btn, optIdx) => {
                        btn.onclick = () => {
                            q.options.splice(optIdx, 1);
                            window.triggerAutoSave();
                            renderQuestions();
                        };
                    });

                    // Add option button
                    const addOptBtn = card.querySelector('.add-option-btn');
                    if (addOptBtn) {
                        addOptBtn.onclick = () => {
                            if (!q.options) q.options = [];
                            q.options.push('');
                            window.triggerAutoSave();
                            renderQuestions();
                        };
                    }

                    // Option selection handlers (radio/checkbox)
                    card.querySelectorAll('.option-selector').forEach(selector => {
                        selector.onchange = () => {
                            const optIdx = parseInt(selector.dataset.idx);
                            if (!q.selectedOptions) q.selectedOptions = [];

                            if (q.answerType === 'single') {
                                // Single selection - only one can be selected
                                q.selectedOptions = selector.checked ? [optIdx] : [];
                            } else {
                                // Multiple selection - toggle
                                if (selector.checked) {
                                    if (!q.selectedOptions.includes(optIdx)) {
                                        q.selectedOptions.push(optIdx);
                                    }
                                } else {
                                    q.selectedOptions = q.selectedOptions.filter(i => i !== optIdx);
                                }
                            }
                            window.triggerAutoSave();
                        };
                    });
                }

                // Collapse button
                card.querySelector('.question-collapse-btn').onclick = () => {
                    q.collapsed = !q.collapsed;
                    const body = card.querySelector('.question-card-body');
                    const icon = card.querySelector('.question-collapse-btn i');
                    if (q.collapsed) {
                        body.style.display = 'none';
                        card.classList.add('collapsed');
                        icon.setAttribute('data-lucide', 'chevron-right');
                    } else {
                        body.style.display = '';
                        card.classList.remove('collapsed');
                        icon.setAttribute('data-lucide', 'chevron-down');
                    }
                    lucide.createIcons();
                    window.triggerAutoSave();
                };

                // Delete button
                card.querySelector('.question-delete-btn').onclick = () => {
                    showDeleteConfirmation(() => {
                        const tabData = getTabData();
                        tabData.questions = tabData.questions.filter(x => x.id !== q.id);
                        window.triggerAutoSave();
                        renderQuestions();
                    });
                };

                questionsContainer.insertBefore(card, addQBtn);
            });
            lucide.createIcons();
        }

        addQBtn.onclick = () => {
            const tabData = getTabData();
            tabData.questions.push({
                id: `q-${Date.now()}`,
                question: '',
                answer: '',
                answerType: 'text-short'
            });
            window.triggerAutoSave();
            renderQuestions();
        };

        function renderView() {
            const tabData = getTabData();
            let html = '';

            if (tabData.formLink) {
                const displayUrl = tabData.formLink.length > 50
                    ? tabData.formLink.substring(0, 50) + '...'
                    : tabData.formLink;
                html += `
                    <div class="form-view-link-bar">
                        <i data-lucide="link" class="w-4 h-4 text-purple-500 flex-shrink-0"></i>
                        <span class="form-view-link-text" title="${escapeHtml(tabData.formLink)}">${escapeHtml(displayUrl)}</span>
                        <a href="${escapeHtml(tabData.formLink)}" target="_blank" class="form-view-link-btn">
                            <i data-lucide="external-link" class="w-3 h-3"></i>
                            <span>Abrir</span>
                        </a>
                    </div>
                `;
            }

            tabData.questions.forEach((q, idx) => {
                const isSelectionType = q.answerType === 'single' || q.answerType === 'multiple';
                const isShortText = q.answerType === 'text-short';
                const isLongText = q.answerType === 'text-long' || q.answerType === 'text';

                // Process placeholders
                const processedQ = processAllPlaceholders(q.question || '');
                const processedA = processAllPlaceholders(q.answer || '');
                const hasError = processedQ.error || processedA.error;
                const hasWarning = processedQ.warning || processedA.warning;
                const alertHtml = hasError
                    ? '<span class="view-card-alert error" title="Placeholder no existe"><i data-lucide="alert-circle" class="w-3 h-3"></i></span>'
                    : (hasWarning ? '<span class="view-card-alert warning" title="Placeholder vacío"><i data-lucide="alert-triangle" class="w-3 h-3"></i></span>' : '');

                if (isShortText) {
                    // COMPACT: Single line - Number + Question → Answer + Copy icon
                    html += `
                        <div class="view-card-short ${hasError ? 'has-error' : (hasWarning ? 'has-warning' : '')}" data-qidx="${idx}">
                            <span class="view-short-num">${idx + 1}.</span>
                            <span class="view-short-question">${processedQ.html || ''}</span>
                            <span class="view-short-arrow">→</span>
                            <span class="view-short-answer">${processedA.html || '<em class="text-gray-400">—</em>'}</span>
                            <button class="view-copy-icon" data-qidx="${idx}" title="Copiar">
                                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                            </button>
                            ${alertHtml}
                        </div>
                    `;
                } else if (isLongText) {
                    // TWO LINES: Header with question + Body with answer paragraph
                    const isCollapsed = q.viewCollapsed || false;
                    html += `
                        <div class="view-card-long ${isCollapsed ? 'collapsed' : ''} ${hasError ? 'has-error' : (hasWarning ? 'has-warning' : '')}" data-qidx="${idx}">
                            <div class="view-long-header">
                                <button class="view-collapse-btn" data-idx="${idx}" title="Colapsar/Expandir">
                                    <i data-lucide="chevron-down" class="w-4 h-4 ${isCollapsed ? 'rotate-collapsed' : ''}"></i>
                                </button>
                                <span class="view-long-num">${idx + 1}.</span>
                                <span class="view-long-question">${processedQ.html || ''}</span>
                                <button class="view-copy-icon" data-qidx="${idx}" title="Copiar">
                                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>
                            <div class="view-long-body" ${isCollapsed ? 'style="display:none;"' : ''}>
                                ${processedA.html || '<em class="text-gray-400">Sin respuesta</em>'}
                            </div>
                            ${alertHtml}
                        </div>
                    `;
                } else if (isSelectionType) {
                    // SELECTION: Header + Only selected option(s)
                    const selectedIndices = q.selectedOptions || [];
                    let selectedHtml = '';
                    let selectHasError = hasError;
                    let selectHasWarning = hasWarning;

                    if (selectedIndices.length > 0 && q.options) {
                        selectedHtml = selectedIndices.map(i => {
                            const opt = q.options[i] || '';
                            const processed = processAllPlaceholders(opt);
                            if (processed.error) selectHasError = true;
                            if (processed.warning) selectHasWarning = true;
                            const marker = q.answerType === 'single' ? '●' : '☑';
                            return `<span class="view-selected-opt">${marker} ${processed.html || escapeHtml(opt)}</span>`;
                        }).join(' ');
                    } else {
                        selectedHtml = '<em class="text-gray-400">Sin selección</em>';
                    }

                    const selectAlertHtml = selectHasError
                        ? '<span class="view-card-alert error" title="Placeholder no existe"><i data-lucide="alert-circle" class="w-3 h-3"></i></span>'
                        : (selectHasWarning ? '<span class="view-card-alert warning" title="Placeholder vacío"><i data-lucide="alert-triangle" class="w-3 h-3"></i></span>' : '');

                    const isCollapsed = q.viewCollapsed || false;
                    html += `
                        <div class="view-card-select ${isCollapsed ? 'collapsed' : ''} ${selectHasError ? 'has-error' : (selectHasWarning ? 'has-warning' : '')}" data-qidx="${idx}">
                            <div class="view-select-header">
                                <button class="view-collapse-btn" data-idx="${idx}" title="Colapsar/Expandir">
                                    <i data-lucide="chevron-down" class="w-4 h-4 ${isCollapsed ? 'rotate-collapsed' : ''}"></i>
                                </button>
                                <span class="view-select-num">${idx + 1}.</span>
                                <span class="view-select-question">${processedQ.html || ''}</span>
                                <button class="view-copy-icon" data-qidx="${idx}" title="Copiar">
                                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                                </button>
                            </div>
                            <div class="view-select-answer" ${isCollapsed ? 'style="display:none;"' : ''}>${selectedHtml}</div>
                            ${selectAlertHtml}
                        </div>
                    `;
                }
            });

            viewContainer.innerHTML = html;

            // Copy handlers for all card types
            viewContainer.querySelectorAll('.view-copy-icon').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.qidx);
                    const q = tabData.questions[idx];
                    let textToCopy = '';

                    if ((q.answerType === 'single' || q.answerType === 'multiple') && q.options) {
                        const selectedIndices = q.selectedOptions || [];
                        textToCopy = selectedIndices.map(i => {
                            let optText = q.options[i] || '';
                            optText = optText
                                .replace(/\[\[([^\[\]]+)\]\]/g, (m, name) => getConceptContent(name.trim()) || m)
                                .replace(/\{([^{}]+)\}/g, (m, k) => window.globalSelectedData?.[k.trim()] ?? m);
                            return optText;
                        }).join(', ');
                    } else {
                        textToCopy = (q.answer || '')
                            .replace(/\[\[([^\[\]]+)\]\]/g, (m, name) => getConceptContent(name.trim()) || m)
                            .replace(/\{([^{}]+)\}/g, (m, k) => window.globalSelectedData?.[k.trim()] ?? m);
                    }

                    // Limpiar espacios extras antes de copiar
                    textToCopy = cleanTextForCopy(textToCopy);

                    navigator.clipboard.writeText(textToCopy).then(() => {
                        const icon = btn.querySelector('i');
                        icon.setAttribute('data-lucide', 'check');
                        icon.classList.add('text-green-600');
                        lucide.createIcons();
                        setTimeout(() => {
                            icon.setAttribute('data-lucide', 'copy');
                            icon.classList.remove('text-green-600');
                            lucide.createIcons();
                        }, 1200);
                    });
                };
            });

            // Collapse handlers for long and select cards
            viewContainer.querySelectorAll('.view-collapse-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.idx);
                    const q = tabData.questions[idx];
                    q.viewCollapsed = !q.viewCollapsed;

                    const card = btn.closest('[data-qidx]');
                    const body = card.querySelector('.view-long-body, .view-select-answer');
                    const icon = btn.querySelector('i');

                    if (q.viewCollapsed) {
                        if (body) body.style.display = 'none';
                        card.classList.add('collapsed');
                        icon.classList.add('rotate-collapsed');
                    } else {
                        if (body) body.style.display = '';
                        card.classList.remove('collapsed');
                        icon.classList.remove('rotate-collapsed');
                    }
                    lucide.createIcons();
                    window.triggerAutoSave();
                };
            });

            lucide.createIcons();
        }

        let isEdit = true;
        toggleBtn.onclick = () => {
            isEdit = !isEdit;
            editMode.classList.toggle('hidden', !isEdit);
            viewMode.classList.toggle('hidden', isEdit);

            if (isEdit) {
                toggleBtn.innerHTML = '<i data-lucide="edit-2" class="w-4 h-4"></i><span class="text-sm font-medium">Vista</span>';
            } else {
                toggleBtn.innerHTML = '<i data-lucide="eye" class="w-4 h-4"></i><span class="text-sm font-medium">Edición</span>';
                renderView();
            }
            lucide.createIcons();
        };

        contentEl.updateView = () => {
            if (!isEdit) renderView();
        };

        renderQuestions();
        contentArea.appendChild(contentEl);
        activateTab(tabId);
        lucide.createIcons();
    }

    // === TAB MANAGEMENT ===

    function activateTab(id) {
        document.querySelectorAll('.chrome-tab').forEach(x => x.classList.remove('active'));
        document.querySelector(`.chrome-tab[data-id="${id}"]`)?.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));

        const content = document.getElementById(`content-${id}`);
        if (content) {
            content.classList.add('active');
            if (content.updateView) content.updateView();
        }
        noTabsState.classList.add('hidden');
        window.triggerAutoSave(); // Save active tab state
    }

    function reset() {
        document.querySelectorAll('.chrome-tab').forEach(t => t.remove());
        document.querySelectorAll('.tab-content').forEach(c => c.remove());
        tabCounter = 1;
        noTabsState.classList.remove('hidden');
        rebindAddButton();
    }

    function rebindAddButton() {
        tabsContainerEl.innerHTML = '<div class="add-tab-btn" id="add-tab-btn" title="Nueva pestaña"><i data-lucide="plus" class="w-5 h-5"></i></div>';
        document.getElementById('add-tab-btn').onclick = openTabTypeModal;
        lucide.createIcons();
    }

    function restoreTab(tabData) {
        if (tabData.type === 'form') {
            createFormTab(tabData);
        } else {
            createConceptTab(tabData);
        }
    }

    // === EXPORT FUNCTIONALITY ===

    let currentExportTabId = null;
    let exportColumnOrder = [];

    /**
     * Opens the export configuration modal
     */
    function openExportModal(tabId) {
        currentExportTabId = tabId;
        const tabData = window.findTab(tabId);
        if (!tabData) return;

        // Check if Excel is loaded
        if (!window.globalHeaders || window.globalHeaders.length === 0) {
            alert('Por favor, carga un archivo Excel primero.');
            return;
        }

        // Build column list: Excel columns + FORMULARIO card
        exportColumnOrder = [];

        // Add Excel columns
        window.globalHeaders.forEach((header, idx) => {
            exportColumnOrder.push({
                id: `excel-${idx}`,
                name: header,
                type: 'excel',
                checked: true
            });
        });

        // Add FORMULARIO card
        exportColumnOrder.push({
            id: 'form',
            name: 'FORMULARIO',
            type: 'form',
            checked: true
        });

        renderExportColumns();
        updateExportRowsInfo();

        document.getElementById('modal-export-config').classList.add('open');
        lucide.createIcons();

        // Set up confirm button
        document.getElementById('export-confirm-btn').onclick = () => performExport();
    }

    /**
     * Renders the draggable column cards
     */
    function renderExportColumns() {
        const container = document.getElementById('export-columns-list');
        if (!container) return;

        container.innerHTML = '';

        exportColumnOrder.forEach((col, idx) => {
            const card = document.createElement('div');
            card.className = `export-column-card ${col.type === 'form' ? 'is-form' : ''}`;
            card.draggable = true;
            card.dataset.idx = idx;

            card.innerHTML = `
                <div class="export-column-drag-handle">
                    <i data-lucide="grip-vertical"></i>
                </div>
                <input type="checkbox" class="export-column-checkbox" ${col.checked ? 'checked' : ''} data-idx="${idx}">
                <span class="export-column-name">${escapeHtml(col.name)}</span>
                <span class="export-column-badge ${col.type === 'form' ? 'badge-form' : 'badge-excel'}">${col.type === 'form' ? 'Form' : 'Excel'}</span>
            `;

            // Checkbox handler
            card.querySelector('.export-column-checkbox').onchange = (e) => {
                exportColumnOrder[idx].checked = e.target.checked;
            };

            // Drag handlers
            card.ondragstart = (e) => {
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', idx);
            };

            card.ondragend = () => {
                card.classList.remove('dragging');
                document.querySelectorAll('.export-column-card').forEach(c => c.classList.remove('drag-over'));
            };

            card.ondragover = (e) => {
                e.preventDefault();
                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== card) {
                    card.classList.add('drag-over');
                }
            };

            card.ondragleave = () => {
                card.classList.remove('drag-over');
            };

            card.ondrop = (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                const toIdx = parseInt(card.dataset.idx);

                if (fromIdx !== toIdx) {
                    const [moved] = exportColumnOrder.splice(fromIdx, 1);
                    exportColumnOrder.splice(toIdx, 0, moved);
                    renderExportColumns();
                }
            };

            container.appendChild(card);
        });

        lucide.createIcons();
    }

    /**
     * Updates the row count info
     */
    function updateExportRowsInfo() {
        const info = document.getElementById('export-rows-info');
        if (!info) return;

        // Get row count from sheet (excluding header)
        const rowCount = window.globalHeaders.length > 0 ?
            (document.querySelectorAll('#grid-wrapper tbody tr').length - 1) : 0;
        info.textContent = `${Math.max(0, rowCount)} filas serán exportadas`;
    }

    /**
     * Processes text with placeholders and returns plain text
     */
    function processPlaceholdersToText(text, rowData) {
        if (!text) return '';

        // First process {$variable} references
        let result = text.replace(/\{\$([^{}]+)\}/g, (match, varName) => {
            const resolved = window.VariablesModule?.resolveVariable(varName.trim(), rowData);
            return resolved !== null && resolved !== undefined ? resolved : match;
        });

        // Then process [[concepto]] references
        result = result.replace(/\[\[([^\[\]]+)\]\]/g, (match, conceptName) => {
            const tab = window.projectData.tabs.find(t => {
                const isConceptType = t.type === 'concept' || t.type === undefined || !t.type;
                return isConceptType && t.title && t.title.toLowerCase().trim() === conceptName.trim().toLowerCase();
            });

            if (!tab || !tab.content) return match;

            // Process the concept content with rowData (including variables)
            let conceptContent = tab.content;
            // Resolve variables in concept content
            conceptContent = conceptContent.replace(/\{\$([^{}]+)\}/g, (m, vn) => {
                const res = window.VariablesModule?.resolveVariable(vn.trim(), rowData);
                return res !== null && res !== undefined ? res : m;
            });
            // Resolve columns in concept content
            return conceptContent.replace(/\{([^{}]+)\}/g, (m, key) => {
                const trimmedKey = key.trim();
                return rowData[trimmedKey] !== undefined ? String(rowData[trimmedKey]) : m;
            });
        });

        // Then process {column} placeholders
        result = result.replace(/\{([^{}]+)\}/g, (match, key) => {
            const trimmedKey = key.trim();
            return rowData[trimmedKey] !== undefined ? String(rowData[trimmedKey]) : match;
        });

        return result;
    }

    /**
     * Performs the actual export
     */
    function performExport() {
        const tabData = window.findTab(currentExportTabId);
        if (!tabData) return;

        // Get all Excel rows
        const tableRows = document.querySelectorAll('#grid-wrapper tbody tr');
        if (tableRows.length < 2) {
            alert('No hay datos para exportar.');
            return;
        }

        // Build header row
        const headerRow = [];
        const checkedColumns = exportColumnOrder.filter(c => c.checked);

        checkedColumns.forEach(col => {
            if (col.type === 'excel') {
                headerRow.push(col.name);
            } else if (col.type === 'form') {
                // Expand form questions as columns
                tabData.questions.forEach(q => {
                    headerRow.push(q.question || `Pregunta ${tabData.questions.indexOf(q) + 1}`);
                });
            }
        });

        // Add ENVIADO column
        headerRow.push('ENVIADO');

        // Build data rows
        const dataRows = [];
        const allRows = Array.from(tableRows);

        // Skip header row (index 0)
        for (let rowIdx = 1; rowIdx < allRows.length; rowIdx++) {
            const tr = allRows[rowIdx];
            const cells = tr.querySelectorAll('td');

            // Build rowData object
            const rowData = {};
            window.globalHeaders.forEach((header, colIdx) => {
                // Offset by 1 for row number column, and possibly +1 for check column
                const cellOffset = document.querySelector('#grid-wrapper .check-col-header') ? 2 : 1;
                const cell = cells[colIdx + cellOffset];
                rowData[header] = cell ? cell.textContent : '';
            });

            // Build the export row
            const exportRow = [];

            checkedColumns.forEach(col => {
                if (col.type === 'excel') {
                    exportRow.push(rowData[col.name] || '');
                } else if (col.type === 'form') {
                    // Process each question
                    tabData.questions.forEach(q => {
                        let answer = '';

                        if (q.answerType === 'single' || q.answerType === 'multiple') {
                            // Selection type - get selected options
                            const selectedIndices = q.selectedOptions || [];
                            if (selectedIndices.length > 0 && q.options) {
                                answer = selectedIndices.map(i => {
                                    const optText = q.options[i] || '';
                                    return processPlaceholdersToText(optText, rowData);
                                }).join(', ');
                            }
                        } else {
                            // Text type
                            answer = processPlaceholdersToText(q.answer || '', rowData);
                        }

                        exportRow.push(answer);
                    });
                }
            });

            // Add empty ENVIADO cell
            exportRow.push('');

            dataRows.push(exportRow);
        }

        // Create workbook with SheetJS
        const wb = XLSX.utils.book_new();

        // Build report header rows
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        const reportRows = [
            ['REPORTE TÉCNICO'],
            ['Formulario:', tabData.title || 'Sin título'],
            ['Fecha de exportación:', dateStr],
            ['Link del formulario:', tabData.formLink || 'No especificado'],
            [''],  // Empty row separator
        ];

        // Combine report + header + data
        const allExportRows = [
            ...reportRows,
            headerRow,
            ...dataRows
        ];

        const ws = XLSX.utils.aoa_to_array ?
            XLSX.utils.aoa_to_sheet(allExportRows) :
            XLSX.utils.aoa_to_sheet(allExportRows);

        // Add data validation for ENVIADO column (dropdown)
        const enviadoColIdx = headerRow.length - 1;
        const enviadoColLetter = getExcelColumnLetter(enviadoColIdx);
        const dataStartRow = reportRows.length + 2; // +1 for header, +1 for 1-indexed
        const dataEndRow = dataStartRow + dataRows.length - 1;

        // Note: XLSX doesn't fully support data validation in browser, 
        // but we can set it up for Excel compatibility
        if (!ws['!dataValidation']) ws['!dataValidation'] = [];

        // Set column widths
        const colWidths = headerRow.map((h, i) => {
            if (i === enviadoColIdx) return { wch: 12 };
            return { wch: Math.min(30, Math.max(12, String(h).length + 2)) };
        });
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, tabData.title ? tabData.title.substring(0, 31) : 'Exportación');

        // Generate and download
        const fileName = `${tabData.title || 'formulario'}_${now.toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);

        window.closeModals();
    }

    /**
     * Gets Excel column letter from index (0 = A, 25 = Z, 26 = AA, etc.)
     */
    function getExcelColumnLetter(index) {
        let letter = '';
        while (index >= 0) {
            letter = String.fromCharCode(65 + (index % 26)) + letter;
            index = Math.floor(index / 26) - 1;
        }
        return letter;
    }

    // === RESTORE TABS ===

    /**
     * Restore multiple tabs from saved project data
     * @param {Array} tabs - Array of tab data objects
     * @param {string} activeTabId - ID of the tab to activate after restore
     */
    function restoreTabs(tabs, activeTabId) {
        console.log(`[TemplateView] Restoring ${tabs?.length || 0} tabs...`);

        // ALWAYS clear existing tabs first (even if new tabs array is empty)
        reset();

        // If no tabs to restore, we're done (UI is now clean)
        if (!tabs || !Array.isArray(tabs) || tabs.length === 0) {
            console.log('[TemplateView] No tabs to restore - UI cleared');
            return;
        }

        // Hide no-tabs state
        if (noTabsState) noTabsState.classList.add('hidden');

        // Restore each tab based on type
        tabs.forEach(tabData => {
            // Reset runtime-only states (recording requires active Selenium session)
            tabData.isRecording = false;
            tabData.recordingInfo = null;
            tabData.isLoadingRecording = false;

            if (tabData.type === 'form') {
                createFormTab(tabData);
            } else if (tabData.type === 'autoform') {
                createAutoFormTab(tabData);
            } else {
                // Default to concept for legacy tabs without type
                createConceptTab(tabData);
            }
        });

        // Activate the saved active tab, or first tab if not found
        if (activeTabId) {
            activateTab(activeTabId);
        } else if (tabs.length > 0) {
            activateTab(tabs[0].id);
        }

        console.log('[TemplateView] Tabs restored');
    }

    // === INIT ===
    function init() {
        const addBtn = document.getElementById('add-tab-btn');
        if (addBtn) addBtn.onclick = openTabTypeModal;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        createTab,
        createConceptTab,
        createFormTab,
        createAutoFormTab,
        activateTab,
        reset,
        rebindAddButton,
        restoreTabs,
        getConceptContent
    };
})();

window.TemplateViewModule = TemplateViewModule;
