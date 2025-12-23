/**
 * PlaceholderEngine - Motor unificado de resolución de placeholders
 * 
 * TIPOS:
 * - {Column}     → Valor de Excel (verde)
 * - {$Variable}  → Variable computada (amarillo)
 * - [[Concept]]  → Contenido de concepto (cyan wrapper)
 * 
 * MODOS:
 * - resolveForView()      → HTML con chips coloreados
 * - resolveForExecution() → Texto plano para Selenium
 * - highlightForEdit()    → HTML con highlighting para edit mode
 */
const PlaceholderEngine = (function () {
    'use strict';

    // Ensure DataResolver is available (should load before this)
    const DR = window.DataResolver || {
        getColumnValue: () => undefined,
        getConceptContent: () => null,
        getVariableValue: () => undefined,
        columnExists: () => true,
        variableExists: () => true,
        conceptExists: () => false
    };

    // Regex combinado para TODOS los tipos de placeholder
    // Groups: [1]=variable, [2]=column, [3]=concept
    const PLACEHOLDER_REGEX = /\{\$([^{}]+)\}|\{([^{}]+)\}|\[\[([^\[\]]+)\]\]/g;

    /**
     * Escape HTML para prevenir XSS
     */
    function escHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Parsea texto y extrae placeholders como tokens
     * @param {string} text - Texto a parsear
     * @returns {Array} [{type: 'variable'|'column'|'concept', name, raw, index}]
     */
    function parse(text) {
        if (!text) return [];
        const tokens = [];
        let match;
        const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');

        while ((match = regex.exec(text)) !== null) {
            if (match[1]) {
                tokens.push({ type: 'variable', name: match[1].trim(), raw: match[0], index: match.index });
            } else if (match[2]) {
                tokens.push({ type: 'column', name: match[2].trim(), raw: match[0], index: match.index });
            } else if (match[3]) {
                tokens.push({ type: 'concept', name: match[3].trim(), raw: match[0], index: match.index });
            }
        }
        return tokens;
    }

    /**
     * Renderiza un chip HTML según tipo y estado
     * @private
     */
    function _renderChip(type, name, value, hasData) {
        const displayName = type === 'variable' ? `{$${name}}` : `{${name}}`;

        if (!hasData) {
            // Sin fila seleccionada - INDIGO (pendiente)
            return `<span class="afv-chip pending">${escHtml(displayName)}</span>`;
        }

        if (value !== undefined && value !== null && value !== '') {
            // Valor resuelto - color según tipo
            const chipClass = type === 'variable' ? 'variable' : 'column';
            return `<span class="afv-chip ${chipClass}">${escHtml(value)}</span>`;
        }

        // Sin valor - RED (error)
        return `<span class="afv-chip empty">${escHtml(displayName)}<i data-lucide="alert-circle"></i></span>`;
    }

    /**
     * MODO VIEW: Genera HTML con chips coloreados
     * 
     * Estados:
     * - Sin datos: INDIGO (pendiente)
     * - Con valor: Verde (column) / Amarillo (variable)
     * - Sin valor: Rojo (error)
     * - Concepto: Wrapper con borde cyan + chips internos
     * 
     * @param {string} text - Texto con placeholders
     * @param {object} rowData - Datos de la fila seleccionada
     * @param {object} options - Opciones adicionales
     * @returns {string} HTML con chips
     */
    function resolveForView(text, rowData, options = {}) {
        if (!text) return '<span class="afv-empty">—</span>';

        const hasData = rowData && Object.keys(rowData).length > 0;
        let result = '';
        let lastIndex = 0;
        let match;
        const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');

        while ((match = regex.exec(text)) !== null) {
            // Texto antes del match
            if (match.index > lastIndex) {
                result += escHtml(text.substring(lastIndex, match.index));
            }

            if (match[1]) {
                // {$Variable}
                const name = match[1].trim();
                const value = DR.getVariableValue(name, rowData);
                result += _renderChip('variable', name, value, hasData);

            } else if (match[2]) {
                // {Column}
                const name = match[2].trim();
                const value = DR.getColumnValue(name, rowData);
                result += _renderChip('column', name, value, hasData);

            } else if (match[3]) {
                // [[Concept]]
                const name = match[3].trim();
                const content = DR.getConceptContent(name);

                if (!hasData) {
                    // Sin datos - mostrar como pendiente
                    result += `<span class="afv-chip pending">[[${escHtml(name)}]]</span>`;
                } else if (content) {
                    // Concepto resuelto: wrapper con borde cyan + procesar placeholders internos
                    const innerHtml = resolveForView(content, rowData, { insideConcept: true });
                    result += `<span class="afv-concept-wrapper">${innerHtml}</span>`;
                } else {
                    // Concepto no encontrado
                    result += `<span class="afv-chip empty">[[${escHtml(name)}]]<i data-lucide="alert-circle"></i></span>`;
                }
            }

            lastIndex = regex.lastIndex;
        }

        // Texto después del último match
        if (lastIndex < text.length) {
            result += escHtml(text.substring(lastIndex));
        }

        return result || '<span class="afv-empty">—</span>';
    }

    /**
     * MODO EXECUTE: Genera texto plano para Selenium
     * Resuelve TODO a texto final, recursivamente para conceptos
     * 
     * @param {string} text - Texto con placeholders
     * @param {object} rowData - Datos de la fila
     * @returns {string} Texto plano resuelto
     */
    function resolveForExecution(text, rowData) {
        if (!text) return '';

        return text.replace(PLACEHOLDER_REGEX, (match, varName, colName, conceptName) => {
            if (varName) {
                const value = DR.getVariableValue(varName.trim(), rowData);
                return (value !== undefined && value !== null) ? String(value) : match;
            }
            if (colName) {
                const value = DR.getColumnValue(colName.trim(), rowData);
                return (value !== undefined && value !== null && value !== '') ? String(value) : match;
            }
            if (conceptName) {
                const content = DR.getConceptContent(conceptName.trim());
                // Resolver recursivamente los placeholders dentro del concepto
                return content ? resolveForExecution(content, rowData) : match;
            }
            return match;
        });
    }

    /**
     * MODO EDIT: Highlighting con validación en tiempo real
     * 
     * Colores:
     * - Verde: Columna válida
     * - Amarillo: Variable válida
     * - Cyan: Concepto válido
     * - Rojo: No existe
     * - Prohibido: [[Concepto]] en pestaña conceptos
     * 
     * @param {string} text - Texto a resaltar
     * @param {object} options - { isConceptTab: boolean }
     * @returns {object} { html: string, hasError: boolean }
     */
    function highlightForEdit(text, options = {}) {
        if (!text) return { html: '', hasError: false };

        const isConceptTab = options.isConceptTab || false;
        let hasError = false;
        let result = '';
        let lastIndex = 0;
        let match;
        const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');

        while ((match = regex.exec(text)) !== null) {
            // Texto antes del match (escapado)
            if (match.index > lastIndex) {
                result += escHtml(text.substring(lastIndex, match.index));
            }

            if (match[1]) {
                // {$Variable}
                const name = match[1].trim();
                const exists = DR.variableExists(name);
                const cls = exists ? 'highlight-variable' : 'highlight-error';
                const title = exists ? '' : ` title="Variable no existe: ${escHtml(name)}"`;
                result += `<span class="${cls}"${title}>{$${escHtml(name)}}</span>`;
                if (!exists) hasError = true;

            } else if (match[2]) {
                // {Column}
                const name = match[2].trim();
                const exists = DR.columnExists(name);
                const cls = exists ? 'highlight-column' : 'highlight-error';
                const title = exists ? '' : ` title="Columna no existe: ${escHtml(name)}"`;
                result += `<span class="${cls}"${title}>{${escHtml(name)}}</span>`;
                if (!exists) hasError = true;

            } else if (match[3]) {
                // [[Concept]]
                const name = match[3].trim();
                if (isConceptTab) {
                    // PROHIBIDO en pestaña conceptos
                    result += `<span class="highlight-forbidden" title="[[Conceptos]] no permitidos dentro de conceptos">[[${escHtml(name)}]]</span>`;
                    hasError = true;
                } else {
                    const exists = DR.conceptExists(name);
                    const cls = exists ? 'highlight-concept' : 'highlight-error';
                    const title = exists ? '' : ` title="Concepto no existe: ${escHtml(name)}"`;
                    result += `<span class="${cls}"${title}>[[${escHtml(name)}]]</span>`;
                    if (!exists) hasError = true;
                }
            }

            lastIndex = regex.lastIndex;
        }

        // Texto después del último match
        if (lastIndex < text.length) {
            result += escHtml(text.substring(lastIndex));
        }

        // Preservar newline final si existe
        if (text.endsWith('\n') && !result.endsWith('\n')) {
            result += '\n';
        }

        return { html: result, hasError };
    }

    /**
     * Verifica si un texto contiene placeholders
     * @param {string} text - Texto a verificar
     * @returns {boolean}
     */
    function hasPlaceholders(text) {
        if (!text) return false;
        return PLACEHOLDER_REGEX.test(text);
    }

    // API Pública
    return {
        parse,
        resolveForView,
        resolveForExecution,
        highlightForEdit,
        hasPlaceholders,
        escapeHtml: escHtml,
        REGEX: PLACEHOLDER_REGEX
    };
})();

// Exportar globalmente
window.PlaceholderEngine = PlaceholderEngine;
