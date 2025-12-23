/**
 * DataResolver - Punto único de acceso a TODAS las fuentes de datos
 * 
 * Fuentes:
 * - Excel: window.globalSelectedData, projectData.excel
 * - Conceptos: projectData.tabs (type: 'concept')
 * - Variables: VariablesModule
 * - Headers: window.globalHeaders
 */
const DataResolver = (function () {
    'use strict';

    /**
     * Normaliza string para comparación
     */
    function normalize(str, level = 3) {
        if (!str) return '';
        let result = String(str).trim();

        // Level 1: Espacios
        if (level >= 1) result = result.replace(/\s+/g, ' ');
        // Level 2: Case
        if (level >= 2) result = result.toLowerCase();
        // Level 3: Acentos
        if (level >= 3) result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        return result;
    }

    /**
     * Obtiene valor de columna Excel con normalización progresiva
     * @param {string} columnName - Nombre de la columna
     * @param {object} rowData - Datos de la fila
     * @returns {any} Valor o undefined
     */
    function getColumnValue(columnName, rowData) {
        if (!rowData || !columnName) return undefined;

        const trimmed = columnName.trim();
        const keys = Object.keys(rowData);

        // 1. Match exacto
        if (rowData[trimmed] !== undefined) return rowData[trimmed];

        // 2. Normalizar espacios
        const norm1 = normalize(trimmed, 1);
        for (const k of keys) {
            if (normalize(k, 1) === norm1) return rowData[k];
        }

        // 3. Case-insensitive
        const norm2 = normalize(trimmed, 2);
        for (const k of keys) {
            if (normalize(k, 2) === norm2) return rowData[k];
        }

        // 4. Sin acentos
        const norm3 = normalize(trimmed, 3);
        for (const k of keys) {
            if (normalize(k, 3) === norm3) return rowData[k];
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
        const search = normalize(conceptName, 2);

        const tab = tabs.find(t =>
            (t.type === 'concept' || !t.type) &&
            normalize(t.title, 2) === search &&
            t.content !== undefined
        );

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

        const search = normalize(columnName, 3);
        return headers.some(h => normalize(h, 3) === search);
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

        const search = normalize(varName, 2);
        return vars.some(v => normalize(v.name, 2) === search);
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
        getVariableNames,
        normalize
    };
})();

// Exportar globalmente
window.DataResolver = DataResolver;
