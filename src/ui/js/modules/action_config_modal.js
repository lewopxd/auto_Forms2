/**
 * Action Config Modal Module
 * Handles the configuration settings for AutoForm Action Cards.
 */
const ActionConfigModal = (function () {
    'use strict';

    let currentCardData = null;
    let onSaveCallback = null;

    function open(cardData, actionType, contextData, onSave) {
        currentCardData = cardData;
        onSaveCallback = onSave;

        const config = cardData.config || {
            timing: { preDelay: 0, randomize: false, minDelay: 0, maxDelay: 100 },
            validation: { verifyContent: false },
            strategy: { type: 'native', typingSpeed: 50, randomizeTyping: false },
            mapping: { enabled: false, placeholder: '', map: {} }
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

        // 3. MAPPING (For SELECT mainly)
        if (type === 'select') {
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
                            <button class="af-btn-ghost" style="border:1px solid #d1d5db;padding:4px" onclick="ActionConfigModal.loadExcelValues()" title="Cargar valores">
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
                    </div>
                </div>
            `;
            setTimeout(() => renderMappingRows(config.mapping?.map || {}, ctx?.options || []), 0);
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
        if (type === 'select') {
            setupSmartInput('cfg-map-col', 'cfg-map-backdrop');
        }
    }

    function setupSmartInput(inputId, backdropId) {
        const input = document.getElementById(inputId);
        const backdrop = document.getElementById(backdropId);
        if (!input || !backdrop) return;

        const update = () => {
            const text = input.value;
            let html = '';
            let lastIndex = 0;
            const regex = /\{([^{}]+)\}/g;
            let match;

            // Validation Data
            const headers = window.globalHeaders || [];

            while ((match = regex.exec(text)) !== null) {
                html += escHtml(text.substring(lastIndex, match.index));

                const val = match[1];
                const cleanVal = val.trim();
                const isValid = headers.includes(cleanVal);

                // Determine Class & Icon
                const chipClass = isValid ? 'valid' : 'invalid';
                // Valid: No Icon. Invalid: Alert Icon
                const iconHtml = isValid
                    ? ''
                    : '<i data-lucide="triangle-alert" class="ac-chip-icon" style="width: 10px; height: 10px; margin-left: 8px;"></i>';

                html += `<span class="ac-smart-chip ${chipClass}">{${escHtml(val)}}${iconHtml}</span>`;

                lastIndex = regex.lastIndex;
            }
            html += escHtml(text.substring(lastIndex));

            backdrop.innerHTML = html;
            if (window.lucide) lucide.createIcons();
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

    function renderMappingRows(currentMap, options) {
        const container = document.getElementById('af-map-rows');
        if (!container) return;
        if (!options || options.length === 0) {
            container.innerHTML = '<div style="padding:10px;text-align:center;color:#9ca3af;font-size:11px">No hay opciones</div>';
            return;
        }
        container.innerHTML = options.map(opt => {
            const key = opt.value || opt.text;
            const mappedVal = currentMap[key] || '';
            return `
                <div class="af-map-row">
                    <div class="af-map-cell left" title="${escHtml(opt.text)}">
                        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${escHtml(opt.text)}</div>
                    </div>
                    <div class="af-map-cell right">
                        <input type="text" class="af-map-input" data-option-key="${escHtml(key)}" 
                               value="${escHtml(mappedVal)}" placeholder="Valor..."
                               style="width:100%;border:1px solid #d1d5db;border-radius:3px;padding:2px 4px;font-size:11px;outline:none;">
                    </div>
                </div>
            `;
        }).join('');
    }

    async function loadExcelValues() {
        const colName = document.getElementById('cfg-map-col').value;
        if (!colName) { alert('Ingrese columna'); return; }
        console.log('Load values:', colName);
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

            const mapCheck = document.getElementById('cfg-map-enable');
            if (mapCheck) {
                newConfig.mapping = {
                    enabled: mapCheck.checked,
                    placeholder: getVal('cfg-map-col', ''),
                    map: {}
                };
                if (mapCheck.checked) {
                    document.querySelectorAll('.af-map-input').forEach(inp => {
                        const key = inp.dataset.optionKey;
                        const val = inp.value.trim();
                        if (val) newConfig.mapping.map[key] = val;
                    });
                }
            }
            if (onSaveCallback) onSaveCallback(newConfig);
            close();
        } catch (e) { console.error(e); close(); }
    }

    function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    return {
        open,
        close,
        toggleFillOpts,
        toggleTimingMode,
        loadExcelValues
    };
})();
window.ActionConfigModal = ActionConfigModal;
