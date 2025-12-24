/**
 * DataResolver - Punto único de acceso a TODAS las fuentes de datos
 * 
 * Fuentes:
 * - Excel: window.globalSelectedData, projectData.excel
 * - Conceptos: projectData.tabs (type: 'concept')
 * - Variables: VariablesModule
 * - Headers: window.globalHeaders
 * 
 * Usa Utils.normalize() y Utils.compare() para comparaciones centralizadas
 */
const DataResolver = (function () {
    'use strict';

    /**
     * Obtiene valor de columna Excel usando Utils.findInObject
     * @param {string} columnName - Nombre de la columna
     * @param {object} rowData - Datos de la fila
     * @returns {any} Valor o undefined
     */
    function getColumnValue(columnName, rowData) {
        if (!rowData || !columnName) return undefined;

        // Usar Utils para búsqueda con normalización configurable
        if (window.Utils) {
            const result = window.Utils.findInObject(columnName, rowData);
            return result.value;
        }

        // Fallback si Utils no está disponible
        const trimmed = columnName.trim();
        if (rowData[trimmed] !== undefined) return rowData[trimmed];

        // Case-insensitive fallback
        const lowerKey = trimmed.toLowerCase();
        for (const k of Object.keys(rowData)) {
            if (k.toLowerCase() === lowerKey) return rowData[k];
        }

        return undefined;
    }

    /**
     * Obtiene contenido de concepto RAW (sin resolver placeholders internos)
     * @param {string} conceptName - Nombre del concepto
     * @returns {string|null} Contenido RAW o null
     */
    function getConceptContent(conceptName) {
        if (!conceptName) return null;

        const tabs = window.projectData?.tabs || [];

        // Buscar concepto usando Utils.compare si disponible
        const tab = tabs.find(t => {
            if (t.type !== 'concept' && t.type !== undefined) return false;
            if (t.content === undefined) return false;

            if (window.Utils) {
                return window.Utils.equals(t.title, conceptName);
            }
            // Fallback
            return t.title?.toLowerCase().trim() === conceptName.toLowerCase().trim();
        });

        return tab?.content ?? null;
    }

    /**
     * Resuelve variable usando VariablesModule
     * @param {string} varName - Nombre de la variable
     * @param {object} rowData - Datos de la fila (para variables que dependen de datos)
     * @returns {any} Valor resuelto o undefined
     */
    function getVariableValue(varName, rowData) {
        if (!varName) return undefined;
        return window.VariablesModule?.resolveVariable(varName.trim(), rowData) ?? undefined;
    }

    /**
     * Obtiene datos de la fila seleccionada
     * @returns {object|null} Datos de la fila o null
     */
    function getSelectedRowData() {
        // Prioridad: globalSelectedData > excel.cachedData
        if (window.globalSelectedData && Object.keys(window.globalSelectedData).length > 0) {
            return window.globalSelectedData;
        }

        const excel = window.projectData?.excel;
        if (!excel || excel.selectedRow < 0) return null;

        return excel.cachedData?.[excel.selectedRow] ?? null;
    }

    /**
     * Obtiene headers de Excel
     * @returns {Array} Headers o array vacío
     */
    function getHeaders() {
        return window.globalHeaders || [];
    }

    /**
     * Valida si una columna existe en los headers
     * @param {string} columnName - Nombre de la columna
     * @returns {boolean}
     */
    function columnExists(columnName) {
        if (!columnName) return false;
        const headers = getHeaders();
        if (headers.length === 0) return true; // Sin Excel cargado, asumir válido

        // Usar Utils.equals para comparación
        if (window.Utils) {
            return headers.some(h => window.Utils.equals(h, columnName));
        }

        // Fallback
        const search = columnName.toLowerCase().trim();
        return headers.some(h => h.toLowerCase().trim() === search);
    }

    /**
     * Valida si una variable existe
     * @param {string} varName - Nombre de la variable
     * @returns {boolean}
     */
    function variableExists(varName) {
        if (!varName) return false;
        const vars = window.projectData?.variables || [];
        if (vars.length === 0) return true; // Sin variables definidas, asumir válido

        // Usar Utils.equals para comparación
        if (window.Utils) {
            return vars.some(v => window.Utils.equals(v.name, varName));
        }

        // Fallback
        const search = varName.toLowerCase().trim();
        return vars.some(v => v.name?.toLowerCase().trim() === search);
    }

    /**
     * Valida si un concepto existe
     * @param {string} conceptName - Nombre del concepto
     * @returns {boolean}
     */
    function conceptExists(conceptName) {
        return getConceptContent(conceptName) !== null;
    }

    /**
     * Obtiene todos los nombres de conceptos disponibles
     * @returns {Array<string>}
     */
    function getConceptNames() {
        const tabs = window.projectData?.tabs || [];
        return tabs
            .filter(t => t.type === 'concept' || !t.type)
            .map(t => t.title)
            .filter(Boolean);
    }

    /**
     * Obtiene todos los nombres de variables disponibles
     * @returns {Array<string>}
     */
    function getVariableNames() {
        return (window.projectData?.variables || []).map(v => v.name);
    }

    // API Pública
    return {
        getColumnValue,
        getConceptContent,
        getVariableValue,
        getSelectedRowData,
        getHeaders,
        columnExists,
        variableExists,
        conceptExists,
        getConceptNames,
        getVariableNames
    };
})();

// Exportar globalmente
window.DataResolver = DataResolver;
