/**
 * Action Config Modal Module
 * Handles the configuration settings for AutoForm Action Cards.
 */
const ActionConfigModal = (function () {
    'use strict';

    let currentCardData = null;
    let onSaveCallback = null;

    /**
     * Open the configuration modal
     * @param {Object} cardData - The card object (must reference the source valid structure)
     * @param {string} actionType - 'fill' | 'select' | 'click'
     * @param {Object} contextData - Additional context (e.g. available Excel columns, unique values)
     * @param {Function} onSave - Callback(newConfig)
     */
    function open(cardData, actionType, contextData, onSave) {
        currentCardData = cardData;
        onSaveCallback = onSave;

        // Ensure config object exists
        const config = cardData.config || {
            timing: { preDelay: 0, randomize: false, minDelay: 0, maxDelay: 100 },
            validation: { verifyContent: false },
            strategy: { type: 'native', typingSpeed: 50, randomizeTyping: false },
            mapping: { enabled: false, placeholder: '', map: {} }
        };

        const modalOverlay = getOrCreateModal();
        renderModalContent(modalOverlay, actionType, config, contextData);

        modalOverlay.classList.add('open');
        if (window.lucide) lucide.createIcons();
    }

    function close() {
        const modal = document.getElementById('af-config-overlay');
        if (modal) modal.classList.remove('open');
        currentCardData = null;
        onSaveCallback = null;
    }

    function getOrCreateModal() {
        let el = document.getElementById('af-config-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'af-config-overlay';
            el.className = 'af-config-overlay';
            el.innerHTML = `
                <div class="af-config-modal">
                    <div class="af-config-header">
                        <div class="af-config-title" id="af-cfg-title">
                            <i data-lucide="settings-2" class="w-5 h-5 text-gray-500"></i>
                            <span>Configuración</span>
                        </div>
                        <button class="af-config-close" onclick="ActionConfigModal.close()">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <div class="af-config-body" id="af-cfg-body">
                        <!-- Dynamic Content -->
                    </div>
                    <div class="af-config-footer">
                        <button class="af-btn-ghost" onclick="ActionConfigModal.close()">Cancelar</button>
                        <button class="af-btn-primary" id="af-cfg-save-btn">Guardar Configuración</button>
                    </div>
                </div>
            `;
            document.body.appendChild(el);

            // Close on overlay click
            el.onclick = (e) => {
                if (e.target === el) close();
            };

            // Save Handler
            el.querySelector('#af-cfg-save-btn').onclick = handleSave;
        }
        return el;
    }

    function renderModalContent(overlay, type, config, ctx) {
        const titleEl = overlay.querySelector('#af-cfg-title span');
        const iconEl = overlay.querySelector('#af-cfg-title i');
        const body = overlay.querySelector('#af-cfg-body');

        // Update Header
        let typeLabel = 'Acción';
        if (type === 'fill') { typeLabel = 'Rellenado'; iconEl.setAttribute('data-lucide', 'type'); }
        if (type === 'select') { typeLabel = 'Selección'; iconEl.setAttribute('data-lucide', 'list'); }
        if (type === 'click') { typeLabel = 'Navegación / Clic'; iconEl.setAttribute('data-lucide', 'mouse-pointer-click'); }
        titleEl.textContent = `Configurar ${typeLabel}`;

        // Build Sections
        let html = '';

        // 1. TIMING SECTION (All types)
        html += `
            <div class="af-config-section">
                <div class="af-config-sec-title">Tiempos y Retardo</div>
                <div class="af-config-row">
                    <div class="af-config-label">Retardo Previo (ms)</div>
                    <input type="number" id="cfg-preDelay" class="af-config-input" value="${config.timing?.preDelay || 0}">
                </div>
                <div class="af-config-row">
                    <div class="af-config-label">Tiempo Aleatorio</div>
                    <label class="af-switch">
                        <input type="checkbox" id="cfg-rndDelay" ${config.timing?.randomize ? 'checked' : ''} 
                               onchange="document.getElementById('cfg-rnd-opts').style.display = this.checked ? 'flex' : 'none'">
                        <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                    </label>
                </div>
                <div class="af-config-row" id="cfg-rnd-opts" style="display: ${config.timing?.randomize ? 'flex' : 'none'}; gap: 10px;">
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
        `;

        // 2. STRATEGY SECTION
        html += `<div class="af-config-section"><div class="af-config-sec-title">Estrategia de Ejecución</div>`;

        if (type === 'fill' || type === 'text' || type === 'number') {
            const strat = config.strategy?.type || 'native';
            html += `
                <div class="af-config-row">
                    <div class="af-config-label">Método de Llenado</div>
                    <select id="cfg-strat-type" class="af-config-select" onchange="ActionConfigModal.toggleFillOpts(this.value)">
                        <option value="native" ${strat === 'native' ? 'selected' : ''}>Simulación de Teclado (Recomendado)</option>
                        <option value="paste" ${strat === 'paste' ? 'selected' : ''}>Pegar Texto (Ctrl+V)</option>
                        <option value="js" ${strat === 'js' ? 'selected' : ''}>Inyección JavaScript (Rápido)</option>
                    </select>
                </div>
                <div id="cfg-fill-opts" style="display:${strat === 'native' ? 'block' : 'none'}">
                    <div class="af-config-row" style="margin-top:10px">
                        <div class="af-config-label">Velocidad de Escritura (ms)</div>
                        <input type="number" id="cfg-typeSpeed" class="af-config-input" value="${config.strategy?.typingSpeed || 50}">
                    </div>
                </div>
            `;
        } else if (type === 'click') {
            const strat = config.strategy?.type || 'native';
            html += `
                <div class="af-config-row">
                    <div class="af-config-label">Método de Clic</div>
                    <select id="cfg-strat-type" class="af-config-select">
                        <option value="native" ${strat === 'native' ? 'selected' : ''}>Simulación Mouse (Real)</option>
                        <option value="js" ${strat === 'js' ? 'selected' : ''}>Clic JavaScript (Forzado)</option>
                    </select>
                </div>
            `;
        } else if (type === 'select') {
            const strat = config.strategy?.type || 'native';
            html += `
                <div class="af-config-row">
                    <div class="af-config-label">Método de Selección</div>
                    <select id="cfg-strat-type" class="af-config-select">
                        <option value="native" ${strat === 'native' ? 'selected' : ''}>Nativo (Clic en Opciones)</option>
                        <option value="js" ${strat === 'js' ? 'selected' : ''}>JavaScript (Value)</option>
                    </select>
                </div>
            `;
        }
        html += `</div>`;

        // 3. VALIDATION SECTION (Only for Fill/Select)
        if (type !== 'click') {
            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Verificación</div>
                    <div class="af-config-row">
                        <div class="af-config-label">Validar contenido post-ejecución</div>
                        <label class="af-switch">
                            <input type="checkbox" id="cfg-verify" ${config.validation?.verifyContent ? 'checked' : ''}>
                            <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                        </label>
                    </div>
                </div>
            `;
        }

        // 4. MAPPING SECTION (Only for Select)
        /*
           Context needs:
           - formOptions: Array of {text, value} from the current question
           - excelValues: Array of strings (unique values from a column) - user triggers fetch?
        */
        if (type === 'select') {
            const mapEnabled = config.mapping?.enabled || false;
            html += `
                <div class="af-config-section">
                    <div class="af-config-sec-title">Mapeo Avanzado Excel</div>
                    <div class="af-config-row">
                        <div class="af-config-label">Habilitar Mapeo de Valores</div>
                        <label class="af-switch">
                            <input type="checkbox" id="cfg-map-enable" ${mapEnabled ? 'checked' : ''}
                                   onchange="document.getElementById('cfg-map-area').style.display = this.checked ? 'block' : 'none'">
                            <span class="af-switch-track"><span class="af-switch-thumb"></span></span>
                        </label>
                    </div>
                    
                    <div id="cfg-map-area" style="display:${mapEnabled ? 'block' : 'none'}">
                        <div class="mb-2">
                             <label class="block text-xs font-semibold text-gray-500 mb-1">Nombre de Columna (Placeholder)</label>
                             <div class="flex gap-2">
                                <input type="text" id="cfg-map-col" class="af-config-input flex-1" style="width:auto" 
                                       value="${escHtml(config.mapping?.placeholder || '')}" placeholder="{Columna}">
                                <button class="af-btn-ghost" style="border:1px solid #d1d5db" onclick="ActionConfigModal.loadExcelValues()">
                                    <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
                                </button>
                             </div>
                        </div>

                        <div class="af-map-container">
                            <div class="af-map-header">
                                <div class="af-map-col">Opción del Formulario</div>
                                <div class="af-map-col">Valor en Excel</div>
                            </div>
                            <div class="af-map-body" id="af-map-rows">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                    </div>
                </div>
            `;
            // Store context for mapping row generation
            setTimeout(() => renderMappingRows(config.mapping?.map || {}, ctx?.options || []), 0);
        }

        body.innerHTML = html;
    }

    function toggleFillOpts(val) {
        const d = document.getElementById('cfg-fill-opts');
        if (d) d.style.display = val === 'native' ? 'block' : 'none';
    }

    function renderMappingRows(currentMap, options) {
        const container = document.getElementById('af-map-rows');
        if (!container) return;

        if (!options || options.length === 0) {
            container.innerHTML = '<div style="padding:10px;text-align:center;color:#9ca3af">No hay opciones disponibles</div>';
            return;
        }

        container.innerHTML = options.map(opt => {
            const key = opt.value || opt.text; // Unique key for the option
            const mappedVal = currentMap[key] || '';

            return `
                <div class="af-map-row">
                    <div class="af-map-cell left" title="${escHtml(opt.text)}">
                        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">
                            ${escHtml(opt.text)}
                        </div>
                    </div>
                    <div class="af-map-cell right">
                        <input type="text" class="af-map-input" data-option-key="${escHtml(key)}" 
                               value="${escHtml(mappedVal)}" placeholder="Valor exacto..."
                               style="width:100%;border:1px solid #d1d5db;border-radius:4px;padding:4px;font-size:12px;">
                    </div>
                </div>
            `;
        }).join('');
    }

    // Mock function -> Should be replaced by Bridge Call
    async function loadExcelValues() {
        // TODO: Implement bridge call to get unique values from column defined in #cfg-map-col
        const colName = document.getElementById('cfg-map-col').value;
        if (!colName) {
            alert('Por favor ingrese el nombre de la columna (ej. {Ciudad})');
            return;
        }
        // For now, we just indicate this feature is ready for backend integration
        console.log('Solicitando valores para columna:', colName);
        // Visual feedback
        const btn = event.currentTarget;
        const icon = btn.querySelector('i');
        icon.classList.add('animate-spin');
        setTimeout(() => icon.classList.remove('animate-spin'), 1000);
    }

    function handleSave() {
        if (!currentCardData) return;

        // Construct Config Object
        const newConfig = {
            timing: {
                preDelay: parseInt(document.getElementById('cfg-preDelay')?.value || 0),
                randomize: document.getElementById('cfg-rndDelay')?.checked || false,
                minDelay: parseInt(document.getElementById('cfg-minDelay')?.value || 0),
                maxDelay: parseInt(document.getElementById('cfg-maxDelay')?.value || 100)
            },
            strategy: {
                type: document.getElementById('cfg-strat-type')?.value || 'native',
            },
            validation: {
                verifyContent: document.getElementById('cfg-verify')?.checked || false
            }
        };

        // Add specific strategy fields
        const typeSpeed = document.getElementById('cfg-typeSpeed');
        if (typeSpeed) newConfig.strategy.typingSpeed = parseInt(typeSpeed.value);

        // Add Mapping (if Select)
        const mapCheck = document.getElementById('cfg-map-enable');
        if (mapCheck) {
            newConfig.mapping = {
                enabled: mapCheck.checked,
                placeholder: document.getElementById('cfg-map-col')?.value || '',
                map: {}
            };

            if (mapCheck.checked) {
                const inputs = document.querySelectorAll('.af-map-input');
                inputs.forEach(inp => {
                    const key = inp.dataset.optionKey;
                    const val = inp.value.trim();
                    if (val) newConfig.mapping.map[key] = val;
                });
            }
        }

        if (onSaveCallback) onSaveCallback(newConfig);
        close();
    }

    function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    return {
        open,
        close,
        toggleFillOpts,
        loadExcelValues
    };
})();

window.ActionConfigModal = ActionConfigModal;
