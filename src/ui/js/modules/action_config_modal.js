/**
 * Action Config Modal Module
 * Handles the configuration settings for AutoForm Action Cards.
 */
(function () {
    'use strict';

    let currentCardData = null;
    let onSaveCallback = null;
    let currentActionType = null;

    // Get default config for action type from centralized projectData
    function getDefaultConfig(type) {
        const defaults = window.projectData?.defaultActionSettings;
        if (!defaults) return {};
        if (type === 'fill' || type === 'text' || type === 'number') return defaults.fill;
        if (type === 'select') return defaults.select;
        if (type === 'click') return defaults.click;
        return {};
    }

    // Check if config differs from default
    function isConfigCustomized(config, type) {
        if (!config) return false;
        const d = getDefaultConfig(type);

        if (config.timing?.preDelay !== (d.timing?.preDelay || 0)) return true;
        if (config.timing?.randomize !== (d.timing?.randomize || false)) return true;
        if (config.timing?.minDelay !== (d.timing?.minDelay || 0)) return true;
        if (config.timing?.maxDelay !== (d.timing?.maxDelay || 100)) return true;
        if (config.strategy?.type !== (d.strategy?.type || 'native')) return true;
        if (d.strategy?.typingSpeed !== undefined && config.strategy?.typingSpeed !== d.strategy.typingSpeed) return true;
        if (config.validation?.verifyContent !== (d.validation?.verifyContent || false)) return true;
        if (d.textType !== undefined && config.textType !== d.textType) return true;
        if (d.mapping !== undefined && config.mapping?.enabled !== (d.mapping?.enabled || false)) return true;

        return false;
    }

    function open(cardData, actionType, contextData, onSave) {
        currentCardData = cardData;
        onSaveCallback = onSave;
        currentActionType = actionType;

        const d = getDefaultConfig(actionType);
        const config = cardData.config || {
            timing: { preDelay: d.timing?.preDelay || 0, randomize: d.timing?.randomize || false, minDelay: d.timing?.minDelay || 0, maxDelay: d.timing?.maxDelay || 100 },
            validation: { verifyContent: d.validation?.verifyContent || false },
            strategy: { type: d.strategy?.type || 'native', typingSpeed: d.strategy?.typingSpeed || 50 },
            mapping: { enabled: d.mapping?.enabled || false, placeholder: '', map: {} }
        };

        const modalOverlay = getOrCreateModal();
        renderModalContent(modalOverlay, actionType, config, contextData);

        // Delegate to robust ModalManager
        if (window.ModalManager) {
            window.ModalManager.openModal(modalOverlay);
        } else {
            // Fallback (should not happen if loaded correctly)
            modalOverlay.style.display = 'flex';
            requestAnimationFrame(() => modalOverlay.classList.add('open'));
        }

        if (window.lucide) lucide.createIcons();
    }

    function close() {
        const modal = document.getElementById('af-config-overlay');
        if (window.ModalManager) {
            window.ModalManager.closeModal(modal);
        } else {
            if (modal) {
                modal.classList.remove('open');
                setTimeout(() => { if (!modal.classList.contains('open')) modal.style.display = 'none'; }, 250);
            }
        }
        currentCardData = null;
        onSaveCallback = null;
    }

    function getOrCreateModal() {
        let el = document.getElementById('af-config-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'af-config-overlay';
            el.className = 'af-modal-overlay'; // Unified Class
            el.innerHTML = `
                <div class="af-modal-window" id="af-config-window">
                    <div class="af-window-header">
                        <div class="af-window-title" id="af-cfg-title">
                            <!-- Icon + Title injected here -->
                        </div>
                        <div class="af-window-close" onclick="ActionConfigModal.close()">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </div>
                    </div>
                    
                    <div class="af-window-body" id="af-cfg-body">
                        <!-- Dynamic Content -->
                    </div>
                    
                    <div class="af-window-footer">
                        <span class="af-reset-link" id="af-cfg-reset-btn">Restaurar predeterminado</span>
                        <div style="flex:1"></div>
                        <button class="af-btn-ghost" onclick="ActionConfigModal.close()">Cancelar</button>
                        <button class="af-btn-primary" id="af-cfg-save-btn">Guardar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(el);

            // Make Draggable using ModalManager
            const win = el.querySelector('.af-modal-window');
            const header = el.querySelector('.af-window-header');
            if (window.ModalManager) {
                window.ModalManager.makeDraggable(win, header);
            }

            // Close on overlay click (if backdrop is clicked)
            el.onmousedown = (e) => {
                if (e.target === el) close();
            };

            el.querySelector('#af-cfg-save-btn').onclick = handleSave;
            el.querySelector('#af-cfg-reset-btn').onclick = resetToDefault;
        }
        return el;
    }

    function renderModalContent(overlay, type, config, ctx) {
        const titleContainer = overlay.querySelector('#af-cfg-title');
        const body = overlay.querySelector('#af-cfg-body');
        const win = overlay.querySelector('.af-modal-window');

        // Reset Accents
        win.classList.remove('accent-orange', 'accent-blue', 'accent-purple', 'accent-green', 'accent-red');

        // Determine Type & Accent
        let typeLabel = 'Acción';
        let iconName = 'settings-2';
        let accentClass = 'accent-orange'; // Default

        if (type === 'fill' || type === 'text' || type === 'number') {
            typeLabel = 'Rellenado';
            iconName = 'type';
            accentClass = 'accent-blue';
        }
        else if (type === 'select') {
            typeLabel = 'Selección';
            iconName = 'list';
            accentClass = 'accent-purple';
        }
        else if (type === 'click') {
            typeLabel = 'Clic / Nav';
            iconName = 'mouse-pointer-click';
            accentClass = 'accent-green';
        }

        // Apply Accent
        win.classList.add(accentClass);

        if (titleContainer) {
            titleContainer.innerHTML = `
                <i data-lucide="${iconName}" class="w-5 h-5"></i>
                <span>Configurar ${typeLabel}</span>
            `;
        }

        let html = '';

        // 0. TEXT TYPE (For Fill only - First section)
        if (type === 'fill' || type === 'text' || type === 'number') {
            const isLongText = config.textType === 'long';
            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Tipo de Texto</div>
                    <div class="af-config-row">
                        <div class="af-text-type-toggle">
                            <div class="af-text-type-option ${!isLongText ? 'active' : ''}" data-value="short" onclick="document.getElementById('cfg-text-type').value='short'; this.classList.add('active'); this.nextElementSibling.classList.remove('active');">
                                Corto
                            </div>
                            <div class="af-text-type-option ${isLongText ? 'active' : ''}" data-value="long" onclick="document.getElementById('cfg-text-type').value='long'; this.classList.add('active'); this.previousElementSibling.classList.remove('active');">
                                Largo (Párrafos)
                            </div>
                        </div>
                        <input type="hidden" id="cfg-text-type" value="${isLongText ? 'long' : 'short'}">
                    </div>
                </div>
            `;
        }

        // 1. TIMING & DELAY
        // Logic: Single Subsection. "Random" Toggle -> If True: Min/Max inputs. If False: Fixed input.
        const isRandom = config.timing?.randomize || false;
        html += `
            <div class="af-config-section">
                <div class="af-config-sec-title">Retardo Previo</div>
                <div class="af-config-row" style="flex-wrap: wrap; gap: 20px;">
                    <!-- Mode Toggle -->
                    <div class="flex items-center gap-2">
                        <div class="af-config-label" style="min-width:auto; margin-right:8px;">Modo Aleatorio</div>
                        <label class="af-switch">
                            <input type="checkbox" id="cfg-rndDelay" ${isRandom ? 'checked' : ''} 
                                   onchange="ActionConfigModal.toggleTimingMode(this.checked)">
                            <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                        </label>
                    </div>

                    <!-- FIXED Mode -->
                    <div id="cfg-fixed-opts" class="flex items-center gap-2" style="display: ${isRandom ? 'none' : 'flex'}">
                        <div class="af-config-label" style="min-width:auto;">Fijo (ms):</div>
                        <input type="number" id="cfg-preDelay" class="af-config-input" style="width:80px" value="${config.timing?.preDelay || 0}">
                    </div>

                    <!-- RANDOM Mode -->
                    <div id="cfg-rnd-opts" class="flex items-center gap-4" style="display: ${isRandom ? 'flex' : 'none'}">
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500">Mín (ms)</span>
                            <input type="number" id="cfg-minDelay" class="af-config-input" style="width:80px" value="${config.timing?.minDelay || 0}">
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-gray-500">Máx (ms)</span>
                            <input type="number" id="cfg-maxDelay" class="af-config-input" style="width:80px" value="${config.timing?.maxDelay || 100}">
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 2. STRATEGY
        if (type === 'fill' || type === 'text' || type === 'number') {
            const strat = config.strategy?.type || 'native';
            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Estrategia</div>
                    <div class="af-config-row" style="gap: 24px;">
                        <div class="flex items-center gap-2">
                            <div class="af-config-label" style="min-width:auto;">Método:</div>
                            <select id="cfg-strat-type" class="af-config-select" onchange="ActionConfigModal.toggleFillOpts(this.value)">
                                <option value="native" ${strat === 'native' ? 'selected' : ''}>Teclado (Nativo)</option>
                                <option value="paste" ${strat === 'paste' ? 'selected' : ''}>Pegar (Ctrl+V)</option>
                                <option value="js" ${strat === 'js' ? 'selected' : ''}>JavaScript (Inyección)</option>
                            </select>
                        </div>
                        
                        <div id="cfg-fill-opts" class="flex items-center gap-2" style="display:${strat === 'native' ? 'flex' : 'none'}">
                            <div class="af-config-label" style="min-width:auto;">Velocidad (ms):</div>
                            <input type="number" id="cfg-typeSpeed" class="af-config-input" style="width: 80px;" value="${config.strategy?.typingSpeed || 50}">
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'select') {
            const strat = config.strategy?.type || 'native';
            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Estrategia</div>
                    <div class="af-config-row">
                        <div class="flex items-center gap-2">
                             <div class="af-config-label" style="min-width:auto;">Método:</div>
                             <select id="cfg-strat-type" class="af-config-select">
                                <option value="native" ${strat === 'native' ? 'selected' : ''}>Nativo (Selección UI)</option>
                                <option value="js" ${strat === 'js' ? 'selected' : ''}>JavaScript (Inyección)</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;
        } else if (type !== 'click') {
            // Generic fallback
        }

        // 3. MAPPING (For SELECT & TEXT)
        if (type === 'select' || type === 'fill' || type === 'text' || type === 'number') {
            const mapEnabled = config.mapping?.enabled || false;
            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Excel Mapping</div>
                    <div class="af-config-row" style="align-items: flex-start; gap: 24px;">
                        <!-- Enable Toggle -->
                        <div class="flex items-center gap-2">
                             <div class="af-config-label" style="min-width:auto;">Habilitar Mapping</div>
                             <label class="af-switch">
                                <input type="checkbox" id="cfg-map-enable" ${mapEnabled ? 'checked' : ''}
                                       onchange="document.getElementById('cfg-map-area').style.display = this.checked ? 'block' : 'none'">
                                <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                            </label>
                        </div>
                    </div>

                     <div id="cfg-map-area" style="display:${mapEnabled ? 'block' : 'none'}; margin-top: 12px;">
                        <div class="mb-2" style="margin-bottom:8px; display: flex; gap: 8px; align-items: center;">
                            <span class="af-config-label" style="min-width:auto;">Columna Excel:</span>
                            <div class="ac-smart-container" style="flex:1; max-width:300px;">
                                <div id="cfg-map-backdrop" class="ac-smart-backdrop"></div>
                                <input type="text" id="cfg-map-col" class="ac-smart-input" 
                                       value="${escHtml(config.mapping?.placeholder || '')}" placeholder="{Columna}">
                            </div>
                            <button id="cfg-reload-btn" class="af-btn-ghost" style="display:none; border:1px solid #d1d5db;padding:4px" onclick="ActionConfigModal.loadExcelValues()" title="Recargar valores">
                                <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
                            </button>
                        </div>
                        <div class="af-map-container">
                            <div class="af-map-header">
                                <div class="af-map-col">Opción</div>
                                <div class="af-map-col">Excel</div>
                            </div>
                            <div class="af-map-body" id="af-map-rows"></div>
                        </div>
                        
                        <!-- Default/Error Subsection -->
                        <div class="af-config-row" style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e5e7eb;">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <span class="af-config-label" style="min-width:auto; font-weight:600;">Default/Error</span>
                                <span title="Valor por defecto si no se encuentra coincidencia válida en la fila" 
                                      style="display:inline-flex;align-items:center;cursor:help;">
                                    <i data-lucide="info" style="width:14px;height:14px;color:#9ca3af;"></i>
                                </span>
                            </div>
                            ${renderDefaultInput(type, config, ctx)}
                        </div>
                    </div>
                </div>
            `;
            setTimeout(() => {
                if (type === 'select') {
                    renderMappingRows(config.mapping?.map || {}, ctx?.options || []);
                } else {
                    // For Text, we wait until column data is loaded or show saved map if exists
                    // Actually, we can only render rows if we know the unique values from the column
                    // So initially it's empty until loadDataIntoMapping is triggered
                    document.getElementById('af-map-rows').innerHTML = '<div style="padding:10px;text-align:center;color:#9ca3af;font-size:11px">Seleccione una columna para ver sus valores únicos...</div>';
                }

                // Auto-load data if there's a saved placeholder
                const savedPlaceholder = config.mapping?.placeholder || '';
                const match = savedPlaceholder.match(/\{([^{}]+)\}/);
                if (match) {
                    loadDataIntoMapping(match[1].trim());
                }
            }, 0);
        }

        // 4. VERIFICATION (ALWAYS LAST)
        if (type !== 'click') {
            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Verificación</div>
                    <div class="af-config-row">
                        <div class="flex items-center gap-2">
                            <div class="af-config-label" style="min-width:auto;">Validar contenido</div>
                            <label class="af-switch">
                                <input type="checkbox" id="cfg-verify" ${config.validation?.verifyContent ? 'checked' : ''}>
                                <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }

        body.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        // Initialize Smart Input
        if (type === 'select' || type === 'fill' || type === 'text' || type === 'number') {
            setupSmartInput('cfg-map-col', 'cfg-map-backdrop', true); // True = Trigger column analysis
            if (type === 'fill' || type === 'text' || type === 'number') {
                // Default input is also smart text for these types
                setupSmartInput('cfg-map-default', 'cfg-map-default-bd', false);
            }
        }

        // Debounce timer and last valid column
        let analyzeDebounceTimer = null;
        let lastValidColumn = null;

        function setupSmartInput(inputId, backdropId, triggerAnalysis = false) {
            const input = document.getElementById(inputId);
            const backdrop = document.getElementById(backdropId);
            if (!input || !backdrop) return;
            attachSmartInputBehavior(input, backdrop, triggerAnalysis);
        }

        /**
         * Reusable logic for attaching smart chips behavior to any input
         */
        function attachSmartInputBehavior(input, backdrop, triggerAnalysis = false) {
            const update = () => {
                const text = input.value;
                let html = '';
                let lastIndex = 0;
                // Combined regex for {Column} and [[Concept]]
                const regex = /\{([^{}]+)\}|\[\[([^\[\]]+)\]\]/g;
                let match;
                let foundValidColumn = null;

                // Validation Data
                const headers = window.globalHeaders || [];
                const conceptTitles = (window.projectData?.tabs || [])
                    .filter(t => t.type === 'concept' || (!t.type && t.content !== undefined))
                    .map(t => t.title?.toLowerCase().trim())
                    .filter(Boolean);

                while ((match = regex.exec(text)) !== null) {
                    // Text before match
                    html += escHtml(text.substring(lastIndex, match.index));

                    let content = '';
                    let isValid = false;
                    let isConcept = false;

                    if (match[1] !== undefined) {
                        // {Column}
                        content = match[1];
                        const cleanVal = content.trim();
                        isValid = headers.includes(cleanVal);
                        if (isValid && cleanVal) foundValidColumn = cleanVal;
                    } else if (match[2] !== undefined) {
                        // [[Concept]]
                        content = match[2];
                        const cleanVal = content.toLowerCase().trim();
                        isValid = conceptTitles.includes(cleanVal);
                        isConcept = true;
                    }

                    // Determine Class & Icon
                    let chipClass = isValid ? 'valid' : 'invalid';
                    if (isConcept && isValid) chipClass = 'valid-concept'; // Ensure you have CSS for this!

                    const iconHtml = isValid
                        ? ''
                        : '<i data-lucide="triangle-alert" class="ac-chip-icon" style="width: 10px; height: 10px; margin-left: 8px;"></i>';

                    const wrapper = isConcept ? `[[${escHtml(content)}]]` : `{${escHtml(content)}}`;
                    html += `<span class="ac-smart-chip ${chipClass}">${wrapper}${iconHtml}</span>`;

                    lastIndex = regex.lastIndex;
                }
                // Text after match
                html += escHtml(text.substring(lastIndex));

                backdrop.innerHTML = html;
                if (window.lucide) lucide.createIcons();

                // Logic specific to the Main Column Input (analysis trigger)
                if (triggerAnalysis) {
                    // Show/hide reload button based on validity
                    const reloadBtn = document.getElementById('cfg-reload-btn');
                    if (reloadBtn) {
                        reloadBtn.style.display = foundValidColumn ? 'flex' : 'none';
                    }

                    // Debounced column analysis
                    if (foundValidColumn && foundValidColumn !== lastValidColumn) {
                        lastValidColumn = foundValidColumn;
                        if (analyzeDebounceTimer) clearTimeout(analyzeDebounceTimer);
                        analyzeDebounceTimer = setTimeout(() => {
                            loadDataIntoMapping(foundValidColumn);
                        }, 300);
                    } else if (!foundValidColumn) {
                        lastValidColumn = null;
                        columnUniqueValues = [];
                        updateMappingSelects();
                    }
                }
            };

            input.oninput = update;
            input.onscroll = () => { backdrop.scrollLeft = input.scrollLeft; };
            // Initial call
            update();
        }

        function toggleFillOpts(val) {
            const d = document.getElementById('cfg-fill-opts');
            if (d) d.style.display = val === 'native' ? 'flex' : 'none'; // Updated to flex
        }

        // New Helper for Mutual Exclusive Timing
        function toggleTimingMode(isRandom) {
            const fixedOpts = document.getElementById('cfg-fixed-opts');
            const rndOpts = document.getElementById('cfg-rnd-opts');
            if (fixedOpts) fixedOpts.style.display = isRandom ? 'none' : 'flex';
            if (rndOpts) rndOpts.style.display = isRandom ? 'flex' : 'none';
        }

        // Store unique column values for dropdowns
        let columnUniqueValues = [];

        /**
         * Render mapping rows structure (called once when modal opens)
         * Creates disabled selects that will be populated later
         */
        function renderMappingRows(currentMap, options) {
            const container = document.getElementById('af-map-rows');
            if (!container) return;
            if (!options || options.length === 0) {
                container.innerHTML = '<div style="padding:10px;text-align:center;color:#9ca3af;font-size:11px">No hay opciones</div>';
                return;
            }

            container.innerHTML = options.map(opt => {
                const key = opt.value || opt.text;
                return `
                <div class="af-map-row">
                    <div class="af-map-cell left" title="${escHtml(opt.text)}">
                        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${escHtml(opt.text)}</div>
                    </div>
                    <div class="af-map-cell right">
                        <select class="af-map-select" data-option-key="${escHtml(key)}" 
                                disabled
                                style="width:100%;border:1px solid #d1d5db;border-radius:3px;padding:2px 4px;font-size:11px;outline:none;background:#f3f4f6;">
                            <option value="">Sin datos...</option>
                        </select>
                    </div>
                </div>
            `;
            }).join('');
        }

        /**
         * Update existing selects with new options (doesn't re-render the structure)
         */
        function updateMappingSelects() {
            const selects = document.querySelectorAll('.af-map-select');
            const config = currentCardData?.config || {};
            const currentMap = config.mapping?.map || {};

            selects.forEach(sel => {
                const key = sel.dataset.optionKey;
                const mappedVal = currentMap[key] || '';

                if (columnUniqueValues.length > 0) {
                    sel.innerHTML = '<option value="">-- Seleccionar --</option>' +
                        columnUniqueValues.map(v =>
                            `<option value="${escHtml(v)}" ${v === mappedVal ? 'selected' : ''}>${escHtml(v)}</option>`
                        ).join('');
                    sel.disabled = false;
                    sel.style.background = 'white';
                } else {
                    sel.innerHTML = '<option value="">Sin datos...</option>';
                    sel.disabled = true;
                    sel.style.background = '#f3f4f6';
                }
            });
        }

        /**
         * Main function to load column data into mapping dropdowns
         * 1. Show spinner, disable button
         * 2. Extract unique values from Excel column
         * 3. Update selects with new options
         * 4. Restore button
         */
        function loadDataIntoMapping(columnName) {
            const reloadBtn = document.getElementById('cfg-reload-btn');

            // 1. Show spinner, disable button
            if (reloadBtn) {
                reloadBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width:14px;height:14px"></i>';
                reloadBtn.disabled = true;
                if (window.lucide) lucide.createIcons();
            }

            // 2. Disable all selects during loading
            document.querySelectorAll('.af-map-select').forEach(sel => {
                sel.disabled = true;
            });

            // Small delay to ensure spinner renders
            setTimeout(() => {
                try {
                    // 3. Get Excel data
                    const headers = window.globalHeaders || [];
                    const data = window.globalExcelData || [];

                    // Find column index
                    const colIndex = headers.indexOf(columnName);
                    if (colIndex === -1) {
                        console.warn('[loadDataIntoMapping] Column not found:', columnName);
                        columnUniqueValues = [];
                    } else {
                        // Extract unique values efficiently using Set
                        const uniqueSet = new Set();
                        for (let i = 0; i < data.length; i++) {
                            const val = data[i][colIndex];
                            if (val !== null && val !== undefined && val !== '') {
                                uniqueSet.add(String(val));
                            }
                        }
                        columnUniqueValues = Array.from(uniqueSet).sort();
                        console.log(`[loadDataIntoMapping] Found ${columnUniqueValues.length} unique values in "${columnName}"`);
                    }

                    // 4. Update UI based on type
                    if (currentActionType === 'select') {
                        updateMappingSelects();
                    } else {
                        renderTextRawMappings(columnUniqueValues);
                    }

                } catch (err) {
                    console.error('[loadDataIntoMapping] Error:', err);
                    columnUniqueValues = [];
                } finally {
                    // 5. Restore button
                    if (reloadBtn) {
                        reloadBtn.innerHTML = '<i data-lucide="refresh-cw" style="width:14px;height:14px"></i>';
                        reloadBtn.disabled = false;
                        if (window.lucide) lucide.createIcons();
                    }
                }
            }, 50);
        }

        /**
         * Renders mapping rows for TEXT type (Left: Excel Value -> Right: Text Input)
         */
        function renderTextRawMappings(values) {
            const container = document.getElementById('af-map-rows');
            if (!container) return;

            const config = currentCardData?.config || {};
            const currentMap = config.mapping?.map || {};

            if (values.length === 0) {
                container.innerHTML = '<div style="padding:10px;text-align:center;color:#9ca3af;font-size:11px">No se encontraron valores únicos</div>';
                return;
            }

            container.innerHTML = values.map((val, idx) => {
                const mappedVal = currentMap[val] || '';
                const inputId = `af-map-inp-${idx}`;
                const backdropId = `af-map-bd-${idx}`;

                return `
                <div class="af-map-row">
                    <div class="af-map-cell left" title="${escHtml(val)}">
                        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${escHtml(val)}</div>
                    </div>
                    <div class="af-map-cell right">
                        <div class="ac-smart-container" style="width:100%;">
                            <div id="${backdropId}" class="ac-smart-backdrop" style="padding:2px 4px;font-size:11px;"></div>
                            <input type="text" id="${inputId}" class="af-map-text-input ac-smart-input" 
                                   data-source-val="${escHtml(val)}"
                                   value="${escHtml(mappedVal)}"
                                   placeholder="Escribir texto o [[Concepto]]"
                                   style="width:100%;border:none;background:transparent;padding:2px 4px;font-size:11px;outline:none;">
                        </div>
                    </div>
                </div>
            `;
            }).join('');

            // Initialize Smart Behavior for all new inputs
            values.forEach((_, idx) => {
                setupSmartInput(`af-map-inp-${idx}`, `af-map-bd-${idx}`, false);
            });
        }

        /**
         * Called when reload button is clicked
         */
        function loadExcelValues() {
            const colInput = document.getElementById('cfg-map-col');
            if (!colInput) return;

            // Extract column name from {ColumnName} format
            const match = colInput.value.match(/\{([^{}]+)\}/);
            if (!match) {
                alert('Ingrese una columna válida en formato {Columna}');
                return;
            }

            const columnName = match[1].trim();
            loadDataIntoMapping(columnName);
        }

        function handleSave() {
            if (!currentCardData) return;
            try {
                const getVal = (id, def) => { const el = document.getElementById(id); return el ? (el.value || def) : def; };
                const getCheck = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };
                const newConfig = {
                    timing: {
                        preDelay: parseInt(getVal('cfg-preDelay', '0')),
                        randomize: getCheck('cfg-rndDelay', false),
                        minDelay: parseInt(getVal('cfg-minDelay', '0')),
                        maxDelay: parseInt(getVal('cfg-maxDelay', '100'))
                    },
                    strategy: { type: getVal('cfg-strat-type', 'native') },
                    validation: { verifyContent: getCheck('cfg-verify', false) }
                };
                const typeSpeed = document.getElementById('cfg-typeSpeed');
                if (typeSpeed) newConfig.strategy.typingSpeed = parseInt(typeSpeed.value);



                // Text type (short/long) for Fill actions - hidden input
                const textTypeEl = document.getElementById('cfg-text-type');
                if (textTypeEl) newConfig.textType = textTypeEl.value || 'short';

                const mapCheck = document.getElementById('cfg-map-enable');
                if (mapCheck) {
                    newConfig.mapping = {
                        enabled: mapCheck.checked,
                        placeholder: getVal('cfg-map-col', ''),
                        defaultValue: getVal('cfg-map-default', ''),
                        map: {}
                    };
                    if (mapCheck.checked) {
                        if (currentActionType === 'select') {
                            document.querySelectorAll('.af-map-select[data-option-key]').forEach(sel => {
                                const key = sel.dataset.optionKey;
                                const val = sel.value.trim();
                                if (key && val) newConfig.mapping.map[key] = val;
                            });
                        } else {
                            // For Text: Key is source-val (Excel), Value is input value
                            document.querySelectorAll('.af-map-text-input[data-source-val]').forEach(inp => {
                                const source = inp.dataset.sourceVal;
                                const val = inp.value; // Don't trim to allow spaces if needed, but usually trim is better. Let's keep it raw or trim? Trim is safer.
                                // Actually, keep raw might be needed for some formats, but trim is standard.
                                if (source && val) newConfig.mapping.map[source] = val.trim();
                            });
                        }
                    }
                }

                // Determine if config differs from default
                newConfig.isCustomized = isConfigCustomized(newConfig, currentActionType);

                if (onSaveCallback) onSaveCallback(newConfig);
                close();
            } catch (e) { console.error(e); close(); }
        }

        function resetToDefault() {
            const d = getDefaultConfig(currentActionType);

            // Reset timing
            const preDelay = document.getElementById('cfg-preDelay');
            if (preDelay) preDelay.value = d.timing?.preDelay || 0;

            const rndDelay = document.getElementById('cfg-rndDelay');
            if (rndDelay) rndDelay.checked = d.timing?.randomize || false;

            const minDelay = document.getElementById('cfg-minDelay');
            if (minDelay) minDelay.value = d.timing?.minDelay || 0;

            const maxDelay = document.getElementById('cfg-maxDelay');
            if (maxDelay) maxDelay.value = d.timing?.maxDelay || 100;

            toggleTimingMode(d.timing?.randomize || false);

            // Reset strategy
            const stratEl = document.getElementById('cfg-strat-type');
            if (stratEl) stratEl.value = d.strategy?.type || 'native';

            const speedEl = document.getElementById('cfg-typeSpeed');
            if (speedEl) speedEl.value = d.strategy?.typingSpeed || 50;

            toggleFillOpts(d.strategy?.type || 'native');

            // Reset validation
            const verifyEl = document.getElementById('cfg-verify');
            if (verifyEl) verifyEl.checked = d.validation?.verifyContent || false;

            // Reset text type
            const textTypeEl = document.getElementById('cfg-text-type');
            if (textTypeEl) textTypeEl.value = d.textType || 'short';
            document.querySelectorAll('.af-text-type-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.value === (d.textType || 'short'));
            });

            // Reset mapping
            const mapEl = document.getElementById('cfg-map-enable');
            if (mapEl) {
                mapEl.checked = d.mapping?.enabled || false;
                const mapArea = document.getElementById('cfg-map-area');
                if (mapArea) mapArea.style.display = mapEl.checked ? 'block' : 'none';
            }
        }

        function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

        window.ActionConfigModal = {
            open,
            close,
            toggleFillOpts,
            toggleTimingMode,
            loadExcelValues,
            resetToDefault
        };

        function renderDefaultInput(type, config, ctx) {
            if (type === 'select') {
                return `
                    <select id="cfg-map-default" 
                            style="width:100%;max-width:180px;border:1px solid #d1d5db;border-radius:3px;padding:2px 4px;font-size:11px;outline:none;background:white;">
                        <option value="">-- Ninguno --</option>
                        ${(ctx?.options || []).map(opt => {
                    const val = opt.value || opt.text;
                    const isSelected = config.mapping?.defaultValue === val;
                    return `<option value="${escHtml(val)}" ${isSelected ? 'selected' : ''}>${escHtml(opt.text)}</option>`;
                }).join('')}
                    </select>
                `;
            } else {
                // Smart Input for Text Default
                const val = config.mapping?.defaultValue || '';
                return `
                    <div class="ac-smart-container" style="width:100%;max-width:200px;">
                        <div id="cfg-map-default-bd" class="ac-smart-backdrop" style="padding:2px 4px;font-size:11px;"></div>
                        <input type="text" id="cfg-map-default" class="ac-smart-input" 
                               value="${escHtml(val)}" 
                               placeholder="Texto o [[Concepto]]"
                               style="width:100%;border:none;background:transparent;padding:2px 4px;font-size:11px;outline:none;">
                    </div>
                `;
            }
        }
    }) ();

