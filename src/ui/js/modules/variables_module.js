/**
 * Variables Module - Handles computed variables with transformations
 * Supports: Date formatting, text case transformations
 * Syntax: {$VariableName} for variable placeholders
 */
const VariablesModule = (function () {
    'use strict';

    // ================== UTILITY ==================
    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ================== DATE FORMATTER ==================
    const DateFormatter = {
        // Spanish month names
        MONTHS_ES: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
        MONTHS_ES_ABBR: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
            'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],

        // Input format patterns
        INPUT_FORMATS: [
            { id: 'AAAA-MM-DD', pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: ['Y', 'M', 'D'] },
            { id: 'DD/MM/AAAA', pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['D', 'M', 'Y'] },
            { id: 'DD-MM-AAAA', pattern: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['D', 'M', 'Y'] },
            { id: 'DD/MM/AA', pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: ['D', 'M', 'Y'], shortYear: true },
            { id: 'MM/DD/AAAA', pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['M', 'D', 'Y'] },
            { id: 'AAAA/MM/DD', pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ['Y', 'M', 'D'] },
            { id: 'DD.MM.AAAA', pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: ['D', 'M', 'Y'] },
        ],

        // Output format definitions
        OUTPUT_FORMATS: [
            { id: 'day_month_year_text', label: '23 de agosto de 2025' },
            { id: 'full_text', label: '23 días del mes de agosto del año 2025' },
            { id: 'dd_mm_yyyy', label: '23/08/2025' },
            { id: 'yyyy_mm_dd', label: '2025-08-23' },
            { id: 'dd_mm_yy', label: '23/08/25' },
            { id: 'month_day_year', label: 'agosto 23, 2025' },
            { id: 'day_abbr_year', label: '23 Ago 2025' },
            { id: 'iso', label: '2025-08-23' },
        ],

        /**
         * Detect input format from a date string
         */
        detect(dateStr) {
            if (!dateStr || typeof dateStr !== 'string') return null;
            const trimmed = dateStr.trim();

            for (const fmt of this.INPUT_FORMATS) {
                if (fmt.pattern.test(trimmed)) {
                    return fmt.id;
                }
            }
            return null;
        },

        /**
         * Parse date string using specified format
         * Returns { year, month, day } or null
         */
        parse(dateStr, formatId) {
            if (!dateStr || typeof dateStr !== 'string') return null;
            const trimmed = dateStr.trim();

            // Find format
            const fmt = this.INPUT_FORMATS.find(f => f.id === formatId);
            if (!fmt) {
                // Try auto-detect
                const detected = this.detect(trimmed);
                if (!detected) return null;
                return this.parse(trimmed, detected);
            }

            const match = trimmed.match(fmt.pattern);
            if (!match) return null;

            const parts = {};
            fmt.order.forEach((key, idx) => {
                parts[key] = parseInt(match[idx + 1], 10);
            });

            // Handle short year (e.g., 25 -> 2025)
            if (fmt.shortYear && parts.Y < 100) {
                parts.Y += parts.Y > 50 ? 1900 : 2000;
            }

            // Validate ranges
            if (parts.M < 1 || parts.M > 12) return null;
            if (parts.D < 1 || parts.D > 31) return null;
            if (parts.Y < 1900 || parts.Y > 2100) return null;

            return { year: parts.Y, month: parts.M, day: parts.D };
        },

        /**
         * Format date object to output string
         */
        format(dateObj, outputFormatId) {
            if (!dateObj || !dateObj.year) return '';

            const { year, month, day } = dateObj;
            const pad2 = n => String(n).padStart(2, '0');
            const monthName = this.MONTHS_ES[month - 1] || '';
            const monthAbbr = this.MONTHS_ES_ABBR[month - 1] || '';

            switch (outputFormatId) {
                case 'day_month_year_text':
                    return `${day} de ${monthName} de ${year}`;
                case 'full_text':
                    return `${day} días del mes de ${monthName} del año ${year}`;
                case 'dd_mm_yyyy':
                    return `${pad2(day)}/${pad2(month)}/${year}`;
                case 'yyyy_mm_dd':
                case 'iso':
                    return `${year}-${pad2(month)}-${pad2(day)}`;
                case 'dd_mm_yy':
                    return `${pad2(day)}/${pad2(month)}/${String(year).slice(-2)}`;
                case 'month_day_year':
                    return `${monthName} ${day}, ${year}`;
                case 'day_abbr_year':
                    return `${day} ${monthAbbr} ${year}`;
                default:
                    return `${pad2(day)}/${pad2(month)}/${year}`;
            }
        }
    };

    // ================== TEXT TRANSFORMER ==================
    const TextTransformer = {
        uppercase: (str) => String(str).toUpperCase(),
        lowercase: (str) => String(str).toLowerCase(),
        titlecase: (str) => {
            return String(str).toLowerCase().replace(/(^|[.!?]\s+)([a-záéíóúñü])/gi,
                (match, delimiter, char) => delimiter + char.toUpperCase()
            );
        },
        trim: (str) => String(str).trim(),
        removeSpaces: (str) => String(str).replace(/\s+/g, '')
    };

    // ================== TRANSFORM DEFINITIONS ==================
    const TRANSFORM_TYPES = [
        { id: 'date', label: 'Formato Fecha', hasConfig: true },
        { id: 'uppercase', label: 'MAYÚSCULAS', hasConfig: false },
        { id: 'lowercase', label: 'minúsculas', hasConfig: false },
        { id: 'titlecase', label: 'Tipo Oración', hasConfig: false },
        { id: 'mapping', label: 'Mapeo', hasConfig: true },
    ];

    // ================== CORE RESOLUTION ==================

    /**
     * Find value in data object using Utils for proper normalization
     */
    function findNormalizedValue(key, data) {
        if (!data || !key) return undefined;

        // Use Utils.findInObject for proper normalization (including collapse)
        if (window.Utils) {
            const result = window.Utils.findInObject(key, data);
            return result.value;
        }

        // Fallback without Utils
        if (data[key] !== undefined) return data[key];
        const trimmedKey = key.trim().toLowerCase();
        for (const k of Object.keys(data)) {
            if (k.toLowerCase().trim() === trimmedKey) {
                return data[k];
            }
        }
        return undefined;
    }

    /**
     * Resolve a variable by name, applying all transformations
     * @param {string} varName - Variable name (without {$ })
     * @param {Object} columnData - Row data from Excel
     * @returns {string|null} Resolved value or null if not found
     */
    function resolveVariable(varName, columnData) {
        const variables = window.projectData?.variables || [];

        // Use Utils.equals for variable name matching
        const variable = variables.find(v =>
            window.Utils
                ? window.Utils.equals(v.name, varName)
                : v.name.toLowerCase().trim() === varName.toLowerCase().trim()
        );

        if (!variable) {
            console.warn(`[VariablesModule] Variable not found: "${varName}"`);
            return null;
        }

        // Get base value from source
        let value;
        const sourceMatch = variable.source.match(/^\{([^{}]+)\}$/);

        if (sourceMatch) {
            // Source is a column reference like {ColumnName}
            const colName = sourceMatch[1].trim();
            value = findNormalizedValue(colName, columnData);

            if (value === undefined) {
                console.warn(`[VariablesModule] Column "${colName}" not found for variable "${varName}"`);
                return null;
            }
        } else {
            // Source is a static value
            value = variable.source;
        }

        if (value === undefined || value === null) return null;

        // Apply transformations in order
        for (const transform of variable.transforms || []) {
            if (transform.type === 'mapping') {
                // Mapping transform - lookup value in map using the source column value
                // The source column value is already in 'value' from the source parsing above
                const mapValue = String(value ?? '').trim();
                const map = transform.config?.map || {};

                console.log('[VariablesModule] Mapping lookup:', {
                    mapValue,
                    mapKeys: Object.keys(map),
                    map
                });

                // Find mapped value using Utils for proper normalization
                let mappedValue;
                if (window.Utils) {
                    const result = window.Utils.findInObject(mapValue, map);
                    mappedValue = result.value;
                    console.log('[VariablesModule] Utils lookup:', { foundKey: result.foundKey, matchType: result.matchType, mappedValue });
                } else {
                    mappedValue = map[mapValue];
                    if (mappedValue === undefined) {
                        const foundKey = Object.keys(map).find(k => k.toLowerCase() === mapValue.toLowerCase());
                        mappedValue = foundKey ? map[foundKey] : null;
                        console.log('[VariablesModule] Fallback search:', { foundKey, mappedValue });
                    }
                }

                if (mappedValue !== undefined && mappedValue !== null) {
                    // Resolve placeholders in mapped value
                    value = resolvePlaceholdersInText(mappedValue, columnData);
                    console.log('[VariablesModule] Mapped to:', value);
                } else if (transform.config?.defaultValue) {
                    value = resolvePlaceholdersInText(transform.config.defaultValue, columnData);
                    console.log('[VariablesModule] Using default:', value);
                }
                // If no match and no default, keep original value
            } else {
                value = applyTransform(String(value), transform);
            }
        }

        return value;
    }

    /**
     * Resolve placeholders in text (for mapping values)
     */
    function resolvePlaceholdersInText(text, columnData) {
        if (!text) return text;

        let result = text;

        // Resolve {$Variable}
        result = result.replace(/\{\$([^{}]+)\}/g, (match, varName) => {
            const resolved = resolveVariable(varName.trim(), columnData);
            return resolved !== null ? resolved : match;
        });

        // Resolve {Column}
        result = result.replace(/\{([^{}$]+)\}/g, (match, colName) => {
            const value = findNormalizedValue(colName.trim(), columnData);
            return value !== undefined ? String(value) : match;
        });

        // Resolve [[Concept]] - delegate to PlaceholderEngine if available
        if (window.PlaceholderEngine?.resolveForExecution) {
            result = window.PlaceholderEngine.resolveForExecution(result, columnData);
        }

        return result;
    }

    /**
     * Apply a single transformation to a value
     */
    function applyTransform(value, transform) {
        if (!value || !transform || !transform.type) return value;

        switch (transform.type) {
            case 'date':
                const inputFormat = transform.config?.inputFormat || null;
                const outputFormat = transform.config?.outputFormat || 'dd_mm_yyyy';
                const parsed = DateFormatter.parse(value, inputFormat);
                if (parsed) {
                    return DateFormatter.format(parsed, outputFormat);
                }
                console.warn(`[VariablesModule] Could not parse date: "${value}"`);
                return value;

            case 'uppercase':
                return TextTransformer.uppercase(value);

            case 'lowercase':
                return TextTransformer.lowercase(value);

            case 'titlecase':
                return TextTransformer.titlecase(value);

            case 'mapping':
                // For mapping, we need columnData passed in - but applyTransform signature doesn't have it
                // So mapping is handled specially in resolveVariable
                // Here we just return the value as-is (mapping is processed at resolution time)
                return value;

            default:
                return value;
        }
    }

    /**
     * Check if a variable name exists
     */
    function isValidVariable(varName) {
        const variables = window.projectData?.variables || [];
        return variables.some(v =>
            v.name.toLowerCase().trim() === varName.toLowerCase().trim()
        );
    }

    /**
     * Get all variable names for autocomplete/validation
     */
    function getVariableNames() {
        return (window.projectData?.variables || []).map(v => v.name);
    }

    // ================== VARIABLES MODAL ==================

    let modalOverlay = null;
    let tempVariables = []; // Working copy while editing

    function generateVarId() {
        return 'var-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    }

    /**
     * Open the variables management modal
     */
    function openModal() {
        // Clone current variables for editing
        tempVariables = JSON.parse(JSON.stringify(window.projectData?.variables || []));

        modalOverlay = getOrCreateModal();
        renderModalContent();

        if (window.ModalManager) {
            window.ModalManager.openModal(modalOverlay);
        } else {
            modalOverlay.style.display = 'flex';
            requestAnimationFrame(() => modalOverlay.classList.add('open'));
        }

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Close the modal
     */
    function closeModal() {
        if (window.ModalManager) {
            window.ModalManager.closeModal(modalOverlay);
        } else if (modalOverlay) {
            modalOverlay.classList.remove('open');
            setTimeout(() => { if (!modalOverlay.classList.contains('open')) modalOverlay.style.display = 'none'; }, 250);
        }
        tempVariables = [];
    }

    /**
     * Get or create modal overlay element
     */
    function getOrCreateModal() {
        let el = document.getElementById('af-variables-modal-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'af-variables-modal-overlay';
            el.className = 'af-modal-overlay';
            el.innerHTML = `
                <div class="af-modal-window accent-yellow" id="af-variables-modal-window" style="width: 700px; max-height: 80vh;">
                    <div class="af-window-header">
                        <div class="af-window-title">
                            <i data-lucide="variable" class="w-5 h-5"></i>
                            <span>Variables Computadas</span>
                        </div>
                        <div class="af-window-close" id="var-modal-close-btn">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </div>
                    </div>
                    
                    <div class="af-window-body" id="var-modal-body" style="overflow-y: auto; max-height: calc(80vh - 120px);">
                        <!-- Dynamic content -->
                    </div>
                    
                    <div class="af-window-footer">
                        <button class="af-btn-ghost" id="var-modal-cancel-btn">Cancelar</button>
                        <button class="af-btn-primary" id="var-modal-save-btn">Guardar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(el);

            // Make draggable
            const win = el.querySelector('.af-modal-window');
            const header = el.querySelector('.af-window-header');
            if (window.ModalManager) {
                window.ModalManager.makeDraggable(win, header);
            }

            // Event handlers
            el.querySelector('#var-modal-close-btn').onclick = closeModal;
            el.querySelector('#var-modal-cancel-btn').onclick = closeModal;
            el.querySelector('#var-modal-save-btn').onclick = saveVariables;

            // Close on backdrop click
            el.onmousedown = (e) => {
                if (e.target === el) closeModal();
            };
        }
        return el;
    }

    /**
     * Render modal body content
     */
    function renderModalContent() {
        const body = document.getElementById('var-modal-body');
        if (!body) return;

        let html = `
            <div class="var-modal-info" style="font-size: 12px; color: #6b7280; margin-bottom: 16px; padding: 8px; background: #f9fafb; border-radius: 6px;">
                <div>Crea variables computadas que aplican transformaciones a datos de columnas Excel.</div>
                <div style="margin-top: 4px;"><strong>Uso:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:3px;">{$NombreVariable}</code> en conceptos o tarjetas.</div>
            </div>
            
            <div class="var-table-wrapper" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <div class="var-table-header" style="display: grid; grid-template-columns: 140px 150px 140px 1fr 50px; gap: 0; background: #f3f4f6; font-size: 11px; font-weight: 600; color: #374151;">
                    <div style="padding: 10px 12px; border-right: 1px solid #e5e7eb;">Nombre Variable</div>
                    <div style="padding: 10px 12px; border-right: 1px solid #e5e7eb;">Valor Origen</div>
                    <div style="padding: 10px 12px; border-right: 1px solid #e5e7eb;">Transformación</div>
                    <div style="padding: 10px 12px; border-right: 1px solid #e5e7eb;">Configuración</div>
                    <div style="padding: 10px 12px; text-align: center;"></div>
                </div>
                <div id="var-table-body" style="max-height: 350px; overflow-y: auto;">
                    <!-- Rows will be rendered here -->
                </div>
            </div>
            
            <button id="var-add-new-btn" class="af-btn-ghost" style="margin-top: 12px; width: 100%; border: 2px dashed #d1d5db; justify-content: center;">
                <i data-lucide="plus" class="w-4 h-4"></i>
                <span>Nueva Variable</span>
            </button>
        `;

        body.innerHTML = html;

        // Render existing variables
        renderVariableRows();

        // Add new variable button handler
        document.getElementById('var-add-new-btn').onclick = addNewVariable;

        if (window.lucide) lucide.createIcons();
    }

    /**
     * Render all variable rows
     */
    function renderVariableRows() {
        const container = document.getElementById('var-table-body');
        if (!container) return;

        if (tempVariables.length === 0) {
            container.innerHTML = `
                <div style="padding: 24px; text-align: center; color: #9ca3af; font-size: 13px;">
                    No hay variables definidas. Haz clic en "Nueva Variable" para crear una.
                </div>
            `;
            return;
        }

        let html = '';

        tempVariables.forEach((variable, varIdx) => {
            const transforms = variable.transforms || [];

            // Main variable row (first transform or empty)
            const firstTransform = transforms[0] || { type: '', config: {} };

            html += renderVariableRow(variable, varIdx, 0, firstTransform, true);

            // Additional transform rows
            for (let tIdx = 1; tIdx < transforms.length; tIdx++) {
                html += renderVariableRow(variable, varIdx, tIdx, transforms[tIdx], false);
            }
        });

        container.innerHTML = html;
        attachRowEventHandlers();
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Render a single row (variable or additional transform)
     */
    function renderVariableRow(variable, varIdx, transformIdx, transform, isMainRow) {
        const rowId = `var-row-${varIdx}-${transformIdx}`;
        const isFirstTransform = transformIdx === 0;

        // Transform type options
        const transformOptions = TRANSFORM_TYPES.map(t =>
            `<option value="${t.id}" ${transform.type === t.id ? 'selected' : ''}>${t.label}</option>`
        ).join('');

        // Config cell content (depends on transform type)
        let configHtml = '<span style="color:#9ca3af;">—</span>';
        if (transform.type === 'date') {
            const inputFormats = DateFormatter.INPUT_FORMATS.map(f =>
                `<option value="${f.id}" ${transform.config?.inputFormat === f.id ? 'selected' : ''}>${f.id}</option>`
            ).join('');
            const outputFormats = DateFormatter.OUTPUT_FORMATS.map(f =>
                `<option value="${f.id}" ${transform.config?.outputFormat === f.id ? 'selected' : ''}>${f.label}</option>`
            ).join('');

            configHtml = `
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    <select class="var-config-input-format" data-var="${varIdx}" data-transform="${transformIdx}" 
                            style="flex: 1; min-width: 90px; font-size: 10px; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                        <option value="">Auto</option>
                        ${inputFormats}
                    </select>
                    <span style="color:#9ca3af;">→</span>
                    <select class="var-config-output-format" data-var="${varIdx}" data-transform="${transformIdx}"
                            style="flex: 2; min-width: 120px; font-size: 10px; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 4px;">
                        ${outputFormats}
                    </select>
                </div>
            `;
        } else if (transform.type === 'mapping') {
            configHtml = getMappingConfigHtml(variable, varIdx, transform, transformIdx);
        }

        return `
            <div class="var-table-row" id="${rowId}" data-var="${varIdx}" data-transform="${transformIdx}"
                 style="display: grid; grid-template-columns: 140px 150px 140px 1fr 50px; gap: 0; border-bottom: 1px solid #e5e7eb; font-size: 12px;">
                
                <!-- Name -->
                <div style="padding: 8px 10px; border-right: 1px solid #e5e7eb; ${!isMainRow ? 'background: #f9fafb;' : ''}">
                    ${isMainRow ? `
                        <input type="text" class="var-name-input" data-var="${varIdx}" 
                               value="${escHtml(variable.name)}" 
                               placeholder="MiVariable"
                               style="width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 6px; font-size: 11px;">
                    ` : ''}
                </div>
                
                <!-- Source Value with Backdrop -->
                <div style="padding: 8px 10px; border-right: 1px solid #e5e7eb; ${!isMainRow ? 'background: #f9fafb;' : ''}">
                    ${isMainRow ? `
                        <div class="var-source-container" style="position: relative; background: white;">
                            <div class="var-source-backdrop" id="var-src-bd-${varIdx}" 
                                 style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 4px 6px; font-size: 11px; font-family: inherit;
                                        pointer-events: none; white-space: pre; overflow: hidden; border: 1px solid transparent; border-radius: 4px;
                                        color: #111827;"></div>
                            <input type="text" class="var-source-input" data-var="${varIdx}" id="var-src-input-${varIdx}"
                                   value="${escHtml(variable.source)}" 
                                   placeholder="{Columna}"
                                   style="width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 6px; font-size: 11px; font-family: inherit;
                                          background: transparent; position: relative; z-index: 1; color: transparent; caret-color: #111827;">
                        </div>
                    ` : ''}
                </div>
                
                <!-- Transform Type -->
                <div style="padding: 8px 10px; border-right: 1px solid #e5e7eb;">
                    <select class="var-transform-type" data-var="${varIdx}" data-transform="${transformIdx}"
                            style="width: 100%; border: 1px solid #d1d5db; border-radius: 4px; padding: 4px 6px; font-size: 11px;">
                        <option value="">Sin transformación</option>
                        ${transformOptions}
                    </select>
                </div>
                
                <!-- Config -->
                <div class="var-config-cell" data-var="${varIdx}" data-transform="${transformIdx}" 
                     style="padding: 8px 10px; border-right: 1px solid #e5e7eb; display: flex; align-items: center;">
                    ${configHtml}
                </div>
                
                <!-- Actions -->
                <div style="padding: 8px 6px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ${isMainRow ? `
                        <button class="var-add-transform-btn" data-var="${varIdx}" title="Añadir transformación"
                                style="padding: 4px; border: none; background: #10b981; color: white; border-radius: 4px; cursor: pointer; display: flex;">
                            <i data-lucide="plus" style="width: 12px; height: 12px;"></i>
                        </button>
                        <button class="var-delete-btn" data-var="${varIdx}" title="Eliminar variable"
                                style="padding: 4px; border: none; background: #ef4444; color: white; border-radius: 4px; cursor: pointer; display: flex;">
                            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                        </button>
                    ` : `
                        <button class="var-remove-transform-btn" data-var="${varIdx}" data-transform="${transformIdx}" title="Eliminar transformación"
                                style="padding: 4px; border: none; background: #f97316; color: white; border-radius: 4px; cursor: pointer; display: flex;">
                            <i data-lucide="minus" style="width: 12px; height: 12px;"></i>
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Helper: Generate mapping config HTML
     */
    function getMappingConfigHtml(variable, varIdx, transform, transformIdx) {
        const sourceCol = variable.source || '';
        const mapEntries = transform.config?.map || {};
        const defaultVal = transform.config?.defaultValue || '';
        const mapKeys = Object.keys(mapEntries);
        const colMatch = sourceCol.match(/^\{([^{}]+)\}$/);

        if (!colMatch) {
            return `<div style="font-size: 10px; color: #ef4444; padding: 4px;">
                <i data-lucide="alert-triangle" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:4px;"></i>
                El Valor Origen debe ser {Columna}
            </div>`;
        }

        if (mapKeys.length === 0) {
            return `<div style="font-size: 10px; color: #6b7280; padding: 4px;">
                <i data-lucide="loader-2" class="animate-spin" style="width:12px;height:12px;display:inline;vertical-align:middle;margin-right:4px;"></i>
                Generando mapeo para <strong>${escHtml(colMatch[1])}</strong>...
            </div>`;
        }

        const mapRowsHtml = mapKeys.map((key, idx) => `
            <div class="var-map-row" style="display: flex; gap: 4px; align-items: center; margin-top: 4px;">
                <span style="flex: 1; font-size: 10px; color: #374151; background: #f3f4f6; padding: 2px 6px; border-radius: 3px; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(key)}">${escHtml(key)}</span>
                <span style="color: #9ca3af;">→</span>
                <div style="flex: 2; position: relative; background: white;">
                    <div class="var-map-value-bd" id="var-map-bd-${varIdx}-${transformIdx}-${idx}"
                         style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 2px 4px; font-size: 10px;
                                pointer-events: none; white-space: pre; overflow: hidden; color: #111827;"></div>
                    <input type="text" class="var-map-value-input" data-var="${varIdx}" data-transform="${transformIdx}" data-key="${escHtml(key)}"
                           value="${escHtml(mapEntries[key] || '')}" placeholder="Valor mapeado"
                           style="width: 100%; font-size: 10px; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 3px;
                                  background: transparent; position: relative; color: transparent; caret-color: #111827;">
                </div>
            </div>
        `).join('');

        return `
            <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 9px; color: #6b7280;">Columna: <strong>${escHtml(colMatch[1])}</strong></span>
                    <button class="var-map-refresh-btn" data-var="${varIdx}" data-transform="${transformIdx}"
                            style="font-size: 9px; padding: 2px 6px; background: #e5e7eb; color: #374151; border: none; border-radius: 3px; cursor: pointer;">
                        <i data-lucide="refresh-cw" style="width:10px;height:10px;display:inline;vertical-align:middle;"></i>
                    </button>
                </div>
                <div class="var-map-table" style="border: 1px solid #e5e7eb; border-radius: 4px; padding: 6px; background: #fafafa; max-height: 150px; overflow-y: auto;">
                    ${mapRowsHtml}
                    <div class="var-map-row" style="display: flex; gap: 4px; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e5e7eb;">
                        <span style="flex: 1; font-size: 10px; color: #9ca3af; font-style: italic;">Default</span>
                        <span style="color: #9ca3af;">→</span>
                        <input type="text" class="var-map-default-input" data-var="${varIdx}" data-transform="${transformIdx}"
                               value="${escHtml(defaultVal)}" placeholder="Valor por defecto"
                               style="flex: 2; font-size: 10px; padding: 2px 4px; border: 1px solid #d1d5db; border-radius: 3px;">
                    </div>
                </div>
            </div>
        `;
    }


    /**
     * Generate mapping table from Excel column unique values
     * Uses globalExcelData for robust index-based access
     */
    function generateMappingTable(varIdx, transformIdx, columnName) {
        console.log('[VariablesModule] Generating mapping table for column:', columnName);

        const headers = window.globalHeaders || [];
        const data = window.globalExcelData || [];

        // Find column index using Utils for proper normalization
        let colIndex = headers.indexOf(columnName);
        if (colIndex === -1 && window.Utils) {
            colIndex = headers.findIndex(h => window.Utils.equals(h, columnName));
        } else if (colIndex === -1) {
            // Fallback without Utils
            colIndex = headers.findIndex(h => h.trim().toLowerCase() === columnName.trim().toLowerCase());
        }

        if (colIndex === -1) {
            console.warn('[VariablesModule] Column not found:', columnName);
            return;
        }

        const uniqueValues = new Set();

        // Extract unique values using index
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            // Safety check for row length
            if (row && row.length > colIndex) {
                const val = row[colIndex];
                if (val !== null && val !== undefined && String(val).trim() !== '') {
                    uniqueValues.add(String(val).trim());
                }
            }
        }

        console.log('[VariablesModule] Found unique values:', uniqueValues.size);

        // Ensure config exists
        if (!tempVariables[varIdx].transforms[transformIdx].config) {
            tempVariables[varIdx].transforms[transformIdx].config = {};
        }

        // Preserve existing mapped values
        const oldMap = tempVariables[varIdx].transforms[transformIdx].config?.map || {};
        const newMap = {};
        [...uniqueValues].sort().forEach(val => {
            newMap[val] = oldMap[val] || '';
        });

        tempVariables[varIdx].transforms[transformIdx].config.map = newMap;

        // Update only the config cell to avoid focus loss
        const configCell = document.querySelector(`.var-config-cell[data-var="${varIdx}"][data-transform="${transformIdx}"]`);
        if (configCell) {
            const variable = tempVariables[varIdx];
            const transform = variable.transforms[transformIdx];
            configCell.innerHTML = getMappingConfigHtml(variable, varIdx, transform, transformIdx);

            // Re-attach mapping event handlers for this cell
            attachMappingCellEvents(configCell, varIdx, transformIdx);

            if (window.lucide) lucide.createIcons();
        } else {
            // Fallback to full render if cell not found
            renderVariableRows();
        }
    }

    /**
     * Update backdrop for mapping value inputs (placeholder highlighting)
     */
    function updateMappingBackdrop(input, backdrop) {
        if (!backdrop) return;
        const text = input.value;
        const headers = window.globalHeaders || [];
        const variableNames = window.VariablesModule?.getVariableNames?.() || [];
        const conceptTitles = (window.projectData?.tabs || [])
            .filter(t => t.type === 'concept' || (!t.type && t.content !== undefined))
            .map(t => t.title?.toLowerCase().trim())
            .filter(Boolean);

        let html = '';
        let lastIndex = 0;
        const regex = /(\{\$([^{}]+)\})|(\[\[([^\[\]]+)\]\])|(\{([^{}]+)\})/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            html += escHtml(text.substring(lastIndex, match.index));

            if (match[1]) {
                // {$Variable} - YELLOW
                const varName = match[2].trim();
                const isValid = variableNames.length === 0 || variableNames.some(v => v.toLowerCase() === varName.toLowerCase());
                const style = isValid ? 'background:#fef3c7;color:#92400e;' : 'background:#fee2e2;color:#dc2626;';
                html += `<span style="${style}">{$${escHtml(match[2])}}</span>`;
            } else if (match[3]) {
                // [[Concept]] - CYAN
                const conceptName = match[4].trim().toLowerCase();
                const isValid = conceptTitles.includes(conceptName);
                const style = isValid ? 'background:#cffafe;color:#0891b2;' : 'background:#fee2e2;color:#dc2626;';
                html += `<span style="${style}">[[${escHtml(match[4])}]]</span>`;
            } else if (match[5]) {
                // {Column} - GREEN
                const colName = match[6].trim();
                const isValid = headers.length === 0 || headers.some(h => h.toLowerCase() === colName.toLowerCase());
                const style = isValid ? 'background:#dcfce7;color:#166534;' : 'background:#fee2e2;color:#dc2626;';
                html += `<span style="${style}">{${escHtml(match[6])}}</span>`;
            }
            lastIndex = regex.lastIndex;
        }
        html += escHtml(text.substring(lastIndex));
        backdrop.innerHTML = html;
    }

    /**
     * Attach events only for mapping cell elements
     */
    function attachMappingCellEvents(cell, varIdx, transformIdx) {
        // Refresh button
        cell.querySelectorAll('.var-map-refresh-btn').forEach(btn => {
            btn.onclick = () => {
                const sourceCol = tempVariables[varIdx]?.source || '';
                const colMatch = sourceCol.match(/^\{([^{}]+)\}$/);
                if (colMatch) {
                    generateMappingTable(varIdx, transformIdx, colMatch[1].trim());
                }
            };
        });

        // Value inputs with backdrop
        cell.querySelectorAll('.var-map-value-input').forEach((input, idx) => {
            const backdrop = cell.querySelector(`#var-map-bd-${varIdx}-${transformIdx}-${idx}`);
            const key = input.dataset.key;

            input.oninput = () => {
                if (tempVariables[varIdx]?.transforms?.[transformIdx]?.config?.map) {
                    tempVariables[varIdx].transforms[transformIdx].config.map[key] = input.value;
                }
                if (backdrop) updateMappingBackdrop(input, backdrop);
            };
            if (backdrop) updateMappingBackdrop(input, backdrop);
        });

        // Default value input
        cell.querySelectorAll('.var-map-default-input').forEach(input => {
            input.oninput = () => {
                if (!tempVariables[varIdx]?.transforms?.[transformIdx]?.config) {
                    tempVariables[varIdx].transforms[transformIdx].config = {};
                }
                tempVariables[varIdx].transforms[transformIdx].config.defaultValue = input.value;
            };
        });
    }

    /**
     * Attach event handlers to row elements
     */
    function attachRowEventHandlers() {
        // Name inputs
        document.querySelectorAll('.var-name-input').forEach(input => {
            input.oninput = (e) => {
                const varIdx = parseInt(e.target.dataset.var, 10);
                // Remove spaces and special chars for variable name
                tempVariables[varIdx].name = e.target.value.replace(/[^a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]/g, '');
                e.target.value = tempVariables[varIdx].name;
            };
        });

        // Source inputs with backdrop highlighting + debounced auto-generation
        let sourceDebounceTimers = {};

        document.querySelectorAll('.var-source-input').forEach(input => {
            const varIdx = parseInt(input.dataset.var, 10);
            const backdrop = document.getElementById(`var-src-bd-${varIdx}`);

            const updateBackdrop = (triggerAutoGenerate = false) => {
                if (!backdrop) return;
                const text = input.value;
                const headers = window.globalHeaders || [];
                const variableNames = window.VariablesModule?.getVariableNames?.() || [];
                let html = '';
                let lastIndex = 0;
                let foundValidColumn = null;
                // Combined regex: {$Variable}, [[Concept]], {Column}
                const regex = /(\{\$([^{}]+)\})|(\[\[([^\[\]]+)\]\])|(\{([^{}]+)\})/g;
                let match;

                while ((match = regex.exec(text)) !== null) {
                    html += escHtml(text.substring(lastIndex, match.index));

                    if (match[1]) {
                        // {$Variable} - YELLOW
                        const varName = match[2].trim();
                        const isValid = variableNames.length === 0 ||
                            (window.Utils
                                ? variableNames.some(v => window.Utils.equals(v, varName))
                                : variableNames.some(v => v.toLowerCase() === varName.toLowerCase()));
                        const style = isValid
                            ? 'background: #fef3c7; color: #92400e;'
                            : 'background: #fee2e2; color: #dc2626;';
                        html += `<span style="${style}">{$${escHtml(match[2])}}</span>`;
                    } else if (match[3]) {
                        // [[Concept]] - CYAN
                        const conceptName = match[4].trim();
                        const tabs = window.projectData?.tabs || [];
                        const conceptExists = tabs.some(t =>
                            (t.type === 'concept' || !t.type) &&
                            (window.Utils
                                ? window.Utils.equals(t.title, conceptName)
                                : t.title?.toLowerCase() === conceptName.toLowerCase()));
                        const style = conceptExists
                            ? 'background: #cffafe; color: #0891b2;'
                            : 'background: #fee2e2; color: #dc2626;';
                        html += `<span style="${style}">[[${escHtml(match[4])}]]</span>`;
                    } else if (match[5]) {
                        // {Column} - GREEN
                        const colName = match[6].trim();
                        const isValid = headers.length === 0 ||
                            (window.Utils
                                ? headers.some(h => window.Utils.equals(h, colName))
                                : headers.some(h => h.toLowerCase() === colName.toLowerCase()));
                        if (isValid) foundValidColumn = colName;
                        const style = isValid
                            ? 'background: #dcfce7; color: #166534;'
                            : 'background: #fee2e2; color: #dc2626;';
                        html += `<span style="${style}">{${escHtml(match[6])}}</span>`;
                    }

                    lastIndex = regex.lastIndex;
                }
                html += escHtml(text.substring(lastIndex));
                backdrop.innerHTML = html;

                // Debounced auto-generation - ONLY on user input, not initial render
                if (triggerAutoGenerate && foundValidColumn) {
                    const transform = tempVariables[varIdx]?.transforms?.[0];
                    if (transform?.type === 'mapping' && Object.keys(transform.config?.map || {}).length === 0) {
                        // Only auto-generate if map is empty (first time)
                        if (sourceDebounceTimers[varIdx]) clearTimeout(sourceDebounceTimers[varIdx]);
                        sourceDebounceTimers[varIdx] = setTimeout(() => {
                            generateMappingTable(varIdx, 0, foundValidColumn);
                        }, 300);
                    }
                }
            };

            input.oninput = (e) => {
                tempVariables[varIdx].source = e.target.value;
                updateBackdrop(true); // User input - allow auto-generate
            };

            // Initial render - NO auto-generate
            updateBackdrop(false);
        });

        // Transform type selects
        document.querySelectorAll('.var-transform-type').forEach(select => {
            select.onchange = (e) => {
                const varIdx = parseInt(e.target.dataset.var, 10);
                const transformIdx = parseInt(e.target.dataset.transform, 10);

                if (!tempVariables[varIdx].transforms) tempVariables[varIdx].transforms = [];

                while (tempVariables[varIdx].transforms.length <= transformIdx) {
                    tempVariables[varIdx].transforms.push({ type: '', config: {} });
                }

                tempVariables[varIdx].transforms[transformIdx].type = e.target.value;

                // Set default config
                if (e.target.value === 'date') {
                    tempVariables[varIdx].transforms[transformIdx].config = {
                        inputFormat: '',
                        outputFormat: 'day_month_year_text'
                    };
                } else if (e.target.value === 'mapping') {
                    // Auto-generate mapping table if source is a valid column
                    const sourceCol = tempVariables[varIdx]?.source || '';
                    const colMatch = sourceCol.match(/^\{([^{}]+)\}$/);
                    if (colMatch) {
                        const colName = colMatch[1].trim();
                        const headers = window.globalHeaders || [];
                        if (headers.length === 0 || headers.some(h => h.toLowerCase() === colName.toLowerCase())) {
                            // Valid column found, generate table immediately
                            tempVariables[varIdx].transforms[transformIdx].config = {};
                            renderVariableRows();
                            setTimeout(() => generateMappingTable(varIdx, transformIdx, colName), 50);
                            return; // Skip normal render
                        }
                    }
                    tempVariables[varIdx].transforms[transformIdx].config = {};
                } else {
                    tempVariables[varIdx].transforms[transformIdx].config = {};
                }

                renderVariableRows();
            };
        });

        // Date config: input format
        document.querySelectorAll('.var-config-input-format').forEach(select => {
            select.onchange = (e) => {
                const varIdx = parseInt(e.target.dataset.var, 10);
                const transformIdx = parseInt(e.target.dataset.transform, 10);
                if (tempVariables[varIdx]?.transforms?.[transformIdx]) {
                    tempVariables[varIdx].transforms[transformIdx].config.inputFormat = e.target.value;
                }
            };
        });

        // Date config: output format
        document.querySelectorAll('.var-config-output-format').forEach(select => {
            select.onchange = (e) => {
                const varIdx = parseInt(e.target.dataset.var, 10);
                const transformIdx = parseInt(e.target.dataset.transform, 10);
                if (tempVariables[varIdx]?.transforms?.[transformIdx]) {
                    tempVariables[varIdx].transforms[transformIdx].config.outputFormat = e.target.value;
                }
            };
        });

        // ========== MAPPING CONFIG HANDLERS ==========

        // Helper function to update backdrop with colored placeholders
        const updateMappingBackdrop = (input, backdrop) => {
            if (!backdrop) return;
            const text = input.value;
            const headers = window.globalHeaders || [];
            const variableNames = window.VariablesModule?.getVariableNames?.() || [];
            let html = '';
            let lastIndex = 0;
            const regex = /(\{\$([^{}]+)\})|(\[\[([^\[\]]+)\]\])|(\{([^{}]+)\})/g;
            let match;

            while ((match = regex.exec(text)) !== null) {
                html += escHtml(text.substring(lastIndex, match.index));

                if (match[1]) {
                    const varName = match[2].trim();
                    const isValid = variableNames.length === 0 ||
                        (window.Utils
                            ? variableNames.some(v => window.Utils.equals(v, varName))
                            : variableNames.some(v => v.toLowerCase() === varName.toLowerCase()));
                    const style = isValid ? 'background: #fef3c7; color: #92400e;' : 'background: #fee2e2; color: #dc2626;';
                    html += `< span style = "${style}" > { $${escHtml(match[2])}}</span > `;
                } else if (match[3]) {
                    const conceptName = match[4].trim();
                    const tabs = window.projectData?.tabs || [];
                    const conceptExists = tabs.some(t =>
                        (t.type === 'concept' || !t.type) &&
                        (window.Utils
                            ? window.Utils.equals(t.title, conceptName)
                            : t.title?.toLowerCase() === conceptName.toLowerCase()));
                    const style = conceptExists ? 'background: #cffafe; color: #0891b2;' : 'background: #fee2e2; color: #dc2626;';
                    html += `< span style = "${style}" > [[${escHtml(match[4])}]]</span > `;
                } else if (match[5]) {
                    const colName = match[6].trim();
                    const isValid = headers.length === 0 ||
                        (window.Utils
                            ? headers.some(h => window.Utils.equals(h, colName))
                            : headers.some(h => h.toLowerCase() === colName.toLowerCase()));
                    const style = isValid ? 'background: #dcfce7; color: #166534;' : 'background: #fee2e2; color: #dc2626;';
                    html += `< span style = "${style}" > { ${escHtml(match[6])}}</span > `;
                }
                lastIndex = regex.lastIndex;
            }
            html += escHtml(text.substring(lastIndex));
            backdrop.innerHTML = html;
        };

        // Mapping: generate button - uses variable.source as the column
        document.querySelectorAll('.var-map-generate-btn').forEach(btn => {
            btn.onclick = () => {
                const varIdx = parseInt(btn.dataset.var, 10);
                const transformIdx = parseInt(btn.dataset.transform, 10);
                const sourceCol = tempVariables[varIdx]?.source || '';

                // Extract column name from {Column}
                const colMatch = sourceCol.match(/^\{([^{}]+)\}$/);
                if (!colMatch) {
                    alert('El Valor Origen debe ser una columna en formato {Columna}');
                    return;
                }

                const colName = colMatch[1].trim();
                const excelData = window.projectData?.excelData || [];

                // Get unique values from column
                const uniqueValues = new Set();
                excelData.forEach(row => {
                    const value = row[colName] ??
                        (window.Utils
                            ? row[Object.keys(row).find(k => window.Utils.equals(k, colName))]
                            : row[Object.keys(row).find(k => k.toLowerCase() === colName.toLowerCase())]);
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                        uniqueValues.add(String(value).trim());
                    }
                });

                if (uniqueValues.size === 0) {
                    alert(`No se encontraron valores en la columna "${colName}"`);
                    return;
                }

                // Ensure config exists
                if (!tempVariables[varIdx].transforms[transformIdx].config) {
                    tempVariables[varIdx].transforms[transformIdx].config = {};
                }

                // Create map with unique values (preserve old values)
                const oldMap = tempVariables[varIdx].transforms[transformIdx].config?.map || {};
                const newMap = {};
                [...uniqueValues].sort().forEach(val => {
                    newMap[val] = oldMap[val] || '';
                });

                tempVariables[varIdx].transforms[transformIdx].config.map = newMap;
                renderVariableRows();
            };
        });

        // Mapping: value inputs
        document.querySelectorAll('.var-map-value-input').forEach(input => {
            const varIdx = parseInt(input.dataset.var, 10);
            const transformIdx = parseInt(input.dataset.transform, 10);
            const key = input.dataset.key;
            const idx = [...document.querySelectorAll(`.var-map-value-input[data-var="${varIdx}"][data-transform="${transformIdx}"]`)].indexOf(input);
            const backdrop = document.getElementById(`var-map-bd-${varIdx}-${transformIdx}-${idx}`);

            input.oninput = () => {
                if (tempVariables[varIdx]?.transforms?.[transformIdx]?.config?.map) {
                    tempVariables[varIdx].transforms[transformIdx].config.map[key] = input.value;
                }
                updateMappingBackdrop(input, backdrop);
            };
            updateMappingBackdrop(input, backdrop);
        });

        // Mapping: default value input
        document.querySelectorAll('.var-map-default-input').forEach(input => {
            const varIdx = parseInt(input.dataset.var, 10);
            const transformIdx = parseInt(input.dataset.transform, 10);

            input.oninput = () => {
                if (!tempVariables[varIdx]?.transforms?.[transformIdx]?.config) {
                    tempVariables[varIdx].transforms[transformIdx].config = {};
                }
                tempVariables[varIdx].transforms[transformIdx].config.defaultValue = input.value;
            };
        });

        // Add transform buttons
        document.querySelectorAll('.var-add-transform-btn').forEach(btn => {
            btn.onclick = (e) => {
                const varIdx = parseInt(e.currentTarget.dataset.var, 10);
                if (!tempVariables[varIdx].transforms) tempVariables[varIdx].transforms = [];
                tempVariables[varIdx].transforms.push({ type: '', config: {} });
                renderVariableRows();
            };
        });

        // Remove transform buttons
        document.querySelectorAll('.var-remove-transform-btn').forEach(btn => {
            btn.onclick = (e) => {
                const varIdx = parseInt(e.currentTarget.dataset.var, 10);
                const transformIdx = parseInt(e.currentTarget.dataset.transform, 10);
                if (tempVariables[varIdx]?.transforms) {
                    tempVariables[varIdx].transforms.splice(transformIdx, 1);
                    renderVariableRows();
                }
            };
        });

        // Delete variable buttons
        document.querySelectorAll('.var-delete-btn').forEach(btn => {
            btn.onclick = (e) => {
                const varIdx = parseInt(e.currentTarget.dataset.var, 10);
                tempVariables.splice(varIdx, 1);
                renderVariableRows();
            };
        });
    }

    /**
     * Add a new empty variable
     */
    function addNewVariable() {
        tempVariables.push({
            id: generateVarId(),
            name: '',
            source: '',
            transforms: [{ type: '', config: {} }]
        });
        renderVariableRows();

        // Focus on the new name input
        setTimeout(() => {
            const inputs = document.querySelectorAll('.var-name-input');
            if (inputs.length > 0) {
                inputs[inputs.length - 1].focus();
            }
        }, 50);
    }

    /**
     * Save variables to projectData
     */
    function saveVariables() {
        // Validate and clean
        const validVariables = tempVariables.filter(v => v.name && v.name.trim() !== '');

        // Clean empty transforms
        validVariables.forEach(v => {
            v.transforms = (v.transforms || []).filter(t => t.type && t.type !== '');
        });

        // Save to global state
        if (!window.projectData) window.projectData = {};
        window.projectData.variables = validVariables;

        // Trigger autosave
        if (window.triggerAutoSave) window.triggerAutoSave();

        console.log('[VariablesModule] Saved variables:', validVariables);

        closeModal();
    }

    // ================== EXPORTS ==================
    return {
        // Formatters
        DateFormatter,
        TextTransformer,
        TRANSFORM_TYPES,

        // Resolution
        resolveVariable,
        isValidVariable,
        applyTransform,
        getVariableNames,

        // Modal
        openModal,
        closeModal
    };
})();

// Expose globally
window.VariablesModule = VariablesModule;
