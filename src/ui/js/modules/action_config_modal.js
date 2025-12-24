/**
 * Action Config Modal Module
 * Handles the configuration settings for AutoForm Action Cards.
 */
(function () {
    'use strict';

    let currentCardData = null;
    let onSaveCallback = null;
    let currentActionType = null;

    /**
     * Global Smart Input setup - accessible from anywhere in the module
     * This function must be at module level to be called from renderTextRawMappings
     * Supports [[Concept]] and {$Variable} placeholders
     */
    function globalSetupSmartInput(inputId, backdropId) {
        const input = document.getElementById(inputId);
        const backdrop = document.getElementById(backdropId);
        if (!input || !backdrop) return;

        const update = () => {
            const text = input.value;
            let html = '';
            let lastIndex = 0;
            // Regex for {$Variable} and [[Concept]] (no column analysis needed for mapping inputs)
            // Groups: [1]=variable, [2]=concept
            const regex = /\{\$([^{}]+)\}|\[\[([^\[\]]+)\]\]/g;
            let match;

            // Validation Data
            const conceptTitles = (window.projectData?.tabs || [])
                .filter(t => t.type === 'concept' || (!t.type && t.content !== undefined))
                .map(t => t.title?.toLowerCase().trim())
                .filter(Boolean);

            while ((match = regex.exec(text)) !== null) {
                // Text before match
                html += escHtml(text.substring(lastIndex, match.index));

                if (match[1] !== undefined) {
                    // It's a {$Variable}
                    const varName = match[1].trim();
                    const isValid = window.VariablesModule?.isValidVariable(varName);
                    const chipClass = isValid ? 'valid-variable' : 'invalid';
                    const iconHtml = isValid
                        ? ''
                        : '<i data-lucide="triangle-alert" class="ac-chip-icon" style="width: 10px; height: 10px; margin-left: 8px;"></i>';
                    html += `<span class="ac-smart-chip ${chipClass}">{$${escHtml(varName)}}${iconHtml}</span>`;
                } else if (match[2] !== undefined) {
                    // It's a [[Concept]]
                    const content = match[2];
                    const cleanVal = content.toLowerCase().trim();
                    const isValid = conceptTitles.includes(cleanVal);
                    const chipClass = isValid ? 'valid-concept' : 'invalid';
                    const iconHtml = isValid
                        ? ''
                        : '<i data-lucide="triangle-alert" class="ac-chip-icon" style="width: 10px; height: 10px; margin-left: 8px;"></i>';
                    html += `<span class="ac-smart-chip ${chipClass}">[[${escHtml(content)}]]${iconHtml}</span>`;
                }
                lastIndex = regex.lastIndex;
            }
            // Text after last match (PLAIN TEXT - visible!)
            html += escHtml(text.substring(lastIndex));

            backdrop.innerHTML = html;
            if (window.lucide) lucide.createIcons();
        };

        input.oninput = update;
        input.onscroll = () => { backdrop.scrollLeft = input.scrollLeft; };
        // Initial call to render existing value
        update();
    }

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

    function showCodeViewer() {
        if (!currentCardData) return;

        // Create or get the code viewer modal
        let codeModal = document.getElementById('af-code-viewer-modal');
        if (!codeModal) {
            codeModal = document.createElement('div');
            codeModal.id = 'af-code-viewer-modal';
            codeModal.className = 'af-modal-overlay';
            codeModal.innerHTML = `
                <div class="af-modal-window" style="max-width:600px; min-height:auto;">
                    <div class="af-window-header" style="padding:10px 16px; border:none; background:#f9fafb;">
                        <span style="font-size:13px; font-weight:600; color:#374151;">Código JSON</span>
                        <div class="af-window-close" id="af-code-close-btn" style="cursor:pointer;">
                            <i data-lucide="x" style="width:18px; height:18px; color:#6b7280;"></i>
                        </div>
                    </div>
                    <div style="padding:16px;">
                        <textarea id="af-code-textarea" readonly 
                            style="width:100%; height:300px; font-family:monospace; font-size:11px; 
                                   border:1px solid #e5e7eb; border-radius:6px; padding:12px; 
                                   background:#f9fafb; color:#374151; resize:vertical; outline:none;">
                        </textarea>
                    </div>
                </div>
            `;
            document.body.appendChild(codeModal);

            // Make draggable
            const win = codeModal.querySelector('.af-modal-window');
            const header = codeModal.querySelector('.af-window-header');
            if (window.ModalManager) {
                window.ModalManager.makeDraggable(win, header);
            }

            // Close handlers
            codeModal.querySelector('#af-code-close-btn').onclick = () => {
                if (window.ModalManager) {
                    window.ModalManager.closeModal(codeModal);
                } else {
                    codeModal.classList.remove('open');
                    setTimeout(() => codeModal.style.display = 'none', 250);
                }
            };
            codeModal.onmousedown = (e) => {
                if (e.target === codeModal) {
                    codeModal.querySelector('#af-code-close-btn').click();
                }
            };
        }

        // Set JSON content
        const textarea = codeModal.querySelector('#af-code-textarea');
        textarea.value = JSON.stringify(currentCardData, null, 2);

        // Open modal
        if (window.ModalManager) {
            window.ModalManager.openModal(codeModal);
        } else {
            codeModal.style.display = 'flex';
            requestAnimationFrame(() => codeModal.classList.add('open'));
        }

        if (window.lucide) lucide.createIcons();
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
                        <span class="af-code-link" id="af-cfg-code-btn" style="margin-left:12px; cursor:pointer; color:#6b7280; font-size:11px; text-decoration:underline;">Ver código</span>
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
            el.querySelector('#af-cfg-code-btn').onclick = showCodeViewer;
        }
        return el;
    }

    function renderModalContent(overlay, type, config, ctx) {
        // Debounce timer and last valid column
        let analyzeDebounceTimer = null;
        let lastValidColumn = null;

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
        }

        // 2.5 TEXT & SELECTOR (For CLICK actions with custom actions)
        if (type === 'click' && ctx?.isCustomAction) {
            const isLocked = currentCardData.isLocked !== false;
            const currentText = currentCardData.text || '';
            const currentSelector = currentCardData.selector || '';

            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Text & Selector</div>
                    <div class="af-config-row" style="flex-direction:column; gap:16px;">
                        <!-- Lock Toggle -->
                        <div class="flex items-center gap-2">
                            <div class="af-config-label" style="min-width:auto;">Edición Bloqueada</div>
                            <label class="af-switch">
                                <input type="checkbox" id="cfg-selector-locked" ${isLocked ? 'checked' : ''}
                                       onchange="ActionConfigModal.toggleSelectorLock(this.checked)">
                                <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                            </label>
                            <i data-lucide="${isLocked ? 'lock' : 'lock-open'}" id="cfg-lock-icon" 
                               style="width:16px;height:16px;color:${isLocked ? '#9ca3af' : '#f97316'};margin-left:8px;"></i>
                        </div>
                        
                        <!-- Text Input -->
                        <div class="af-selector-edit-wrapper ${isLocked ? 'locked' : ''}">
                            <label class="af-config-label" style="font-size:11px;color:#6b7280;margin-bottom:4px;display:block;">Text:</label>
                            <input type="text" id="cfg-text-value" class="af-config-input af-click-field-input" 
                                   value="${escHtml(currentText)}"
                                   placeholder="Guardar y enviar otra respuesta"
                                   ${isLocked ? 'readonly' : ''}>
                        </div>
                        
                        <!-- Selector Input -->
                        <div class="af-selector-edit-wrapper ${isLocked ? 'locked' : ''}">
                            <label class="af-config-label" style="font-size:11px;color:#6b7280;margin-bottom:4px;display:block;">Selector:</label>
                            <input type="text" id="cfg-selector-value" class="af-config-input af-click-field-input" 
                                   style="font-family:'Monaco','Consolas',monospace;"
                                   value="${escHtml(currentSelector)}"
                                   placeholder='[data-automation-id="buttonId"]'
                                   ${isLocked ? 'readonly' : ''}>
                        </div>
                    </div>
                </div>
            `;
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
                                <div class="af-map-col">Valor</div>
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

        function setupSmartInput(inputId, backdropId, triggerAnalysis = false) {
            const input = document.getElementById(inputId);
            const backdrop = document.getElementById(backdropId);
            if (!input || !backdrop) return;
            attachSmartInputBehavior(input, backdrop, triggerAnalysis);
        }

        /**
         * Reusable logic for attaching smart chips behavior to any input
         * For column field: blocks {$Variable} with error
         */
        function attachSmartInputBehavior(input, backdrop, triggerAnalysis = false) {
            const update = () => {
                const text = input.value;
                let html = '';
                let lastIndex = 0;
                // Combined regex: {$Variable}, {Column}, [[Concept]]
                // Groups: [1]=variable, [2]=column, [3]=concept
                const regex = /\{\$([^{}]+)\}|\{([^{}]+)\}|\[\[([^\[\]]+)\]\]/g;
                let match;
                let foundValidColumn = null;
                let foundVariable = false;

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
                    let isVariable = false;

                    if (match[1] !== undefined) {
                        // {$Variable} - NOT allowed in column field
                        content = match[1];
                        isVariable = true;
                        foundVariable = true;
                        // Always show as invalid with special styling
                        html += `<span class="ac-smart-chip invalid" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;">{$${escHtml(content)}}<i data-lucide="x-circle" class="ac-chip-icon" style="width: 10px; height: 10px; margin-left: 8px;"></i></span>`;
                    } else if (match[2] !== undefined) {
                        // {Column}
                        content = match[2];
                        const cleanVal = content.trim();
                        isValid = headers.includes(cleanVal);
                        if (isValid && cleanVal) foundValidColumn = cleanVal;

                        let chipClass = isValid ? 'valid' : 'invalid';
                        const iconHtml = isValid
                            ? ''
                            : '<i data-lucide="triangle-alert" class="ac-chip-icon" style="width: 10px; height: 10px; margin-left: 8px;"></i>';
                        html += `<span class="ac-smart-chip ${chipClass}">{${escHtml(content)}}${iconHtml}</span>`;
                    } else if (match[3] !== undefined) {
                        // [[Concept]]
                        content = match[3];
                        const cleanVal = content.toLowerCase().trim();
                        isValid = conceptTitles.includes(cleanVal);
                        isConcept = true;

                        let chipClass = isValid ? 'valid-concept' : 'invalid';
                        const iconHtml = isValid
                            ? ''
                            : '<i data-lucide="triangle-alert" class="ac-chip-icon" style="width: 10px; height: 10px; margin-left: 8px;"></i>';
                        html += `<span class="ac-smart-chip ${chipClass}">[[${escHtml(content)}]]${iconHtml}</span>`;
                    }

                    lastIndex = regex.lastIndex;
                }
                // Text after match
                html += escHtml(text.substring(lastIndex));

                backdrop.innerHTML = html;

                // Show variable error message if in column field
                if (triggerAnalysis && foundVariable) {
                    let errorEl = document.getElementById('cfg-map-col-var-error');
                    if (!errorEl) {
                        errorEl = document.createElement('div');
                        errorEl.id = 'cfg-map-col-var-error';
                        errorEl.style.cssText = 'font-size: 11px; color: #dc2626; margin-top: 4px; display: flex; align-items: center; gap: 4px;';
                        errorEl.innerHTML = '<i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Las variables {$...} no están permitidas en este campo';
                        backdrop.parentNode.appendChild(errorEl);
                    }
                    errorEl.style.display = 'flex';
                } else if (triggerAnalysis) {
                    const errorEl = document.getElementById('cfg-map-col-var-error');
                    if (errorEl) errorEl.style.display = 'none';
                }

                if (window.lucide) lucide.createIcons();

                // Logic specific to the Main Column Input (analysis trigger)
                if (triggerAnalysis) {
                    // Show/hide reload button based on validity
                    const reloadBtn = document.getElementById('cfg-reload-btn');
                    if (reloadBtn) {
                        reloadBtn.style.display = foundValidColumn && !foundVariable ? 'flex' : 'none';
                    }

                    // Debounced column analysis
                    if (foundValidColumn && !foundVariable && foundValidColumn !== lastValidColumn) {
                        lastValidColumn = foundValidColumn;
                        if (analyzeDebounceTimer) clearTimeout(analyzeDebounceTimer);
                        analyzeDebounceTimer = setTimeout(() => {
                            loadDataIntoMapping(foundValidColumn);
                        }, 300);
                    } else if (!foundValidColumn || foundVariable) {
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

    /**
     * Toggle selector lock state for click actions (locks both Text and Selector)
     * @param {boolean} isLocked - Whether the fields should be locked
     */
    function toggleSelectorLock(isLocked) {
        const textInput = document.getElementById('cfg-text-value');
        const selectorInput = document.getElementById('cfg-selector-value');
        const icon = document.getElementById('cfg-lock-icon');

        // Toggle both inputs
        if (textInput) {
            textInput.readOnly = isLocked;
            const wrapper = textInput.closest('.af-selector-edit-wrapper');
            if (wrapper) wrapper.classList.toggle('locked', isLocked);
        }
        if (selectorInput) {
            selectorInput.readOnly = isLocked;
            const wrapper = selectorInput.closest('.af-selector-edit-wrapper');
            if (wrapper) wrapper.classList.toggle('locked', isLocked);
        }

        // Update lock icon
        if (icon) {
            icon.setAttribute('data-lucide', isLocked ? 'lock' : 'lock-open');
            icon.style.color = isLocked ? '#9ca3af' : '#f97316';
            if (window.lucide) lucide.createIcons();
        }
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

        // Initialize Smart Behavior for all new inputs using GLOBAL function
        values.forEach((_, idx) => {
            globalSetupSmartInput(`af-map-inp-${idx}`, `af-map-bd-${idx}`);
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

            // Click-specific: Save text, selector and lock state for custom actions
            if (currentActionType === 'click') {
                const textEl = document.getElementById('cfg-text-value');
                const selectorEl = document.getElementById('cfg-selector-value');
                const lockedEl = document.getElementById('cfg-selector-locked');

                if (textEl) {
                    newConfig.text = textEl.value || '';
                }
                if (selectorEl) {
                    newConfig.selector = selectorEl.value || '';
                }
                if (lockedEl) {
                    newConfig.isLocked = lockedEl.checked;
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
        toggleSelectorLock,
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
})();

