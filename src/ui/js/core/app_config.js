/**
 * AppConfig - Configuración centralizada de la aplicación
 * 
 * Maneja:
 * - Valores por defecto
 * - Lectura/escritura de configuración en projectData.settings
 * - Auto-guardado cuando cambian los settings
 */
const AppConfig = (function () {
    'use strict';

    // Valores por defecto para nuevos proyectos
    const DEFAULTS = {
        normalization: {
            enabled: true,
            flags: {
                trim: true,
                collapse: true,
                lowercase: true,
                accents: true
            }
        }
    };

    /**
     * Inicializa la estructura de settings en projectData si no existe
     */
    function ensureSettingsStructure() {
        if (!window.projectData) {
            window.projectData = {};
        }
        if (!window.projectData.settings) {
            window.projectData.settings = {};
        }
        if (!window.projectData.settings.normalization) {
            window.projectData.settings.normalization = JSON.parse(JSON.stringify(DEFAULTS.normalization));
        }
    }

    /**
     * Obtiene los flags de normalización actuales
     * @returns {object} { trim, collapse, lowercase, accents }
     */
    function getNormalizationFlags() {
        ensureSettingsStructure();
        const norm = window.projectData.settings.normalization;

        // Si la normalización está deshabilitada, devolver todos en false
        if (!norm.enabled) {
            return { trim: false, collapse: false, lowercase: false, accents: false };
        }

        return norm.flags || DEFAULTS.normalization.flags;
    }

    /**
     * Verifica si la normalización está habilitada globalmente
     * @returns {boolean}
     */
    function isNormalizationEnabled() {
        ensureSettingsStructure();
        return window.projectData.settings.normalization.enabled !== false;
    }

    /**
     * Establece los flags de normalización
     * @param {object} flags - { trim, collapse, lowercase, accents }
     * @param {boolean} triggerSave - Si debe disparar autosave
     */
    function setNormalizationFlags(flags, triggerSave = true) {
        ensureSettingsStructure();
        window.projectData.settings.normalization.flags = {
            ...window.projectData.settings.normalization.flags,
            ...flags
        };

        if (triggerSave && window.triggerAutoSave) {
            window.triggerAutoSave();
        }
    }

    /**
     * Habilita o deshabilita la normalización globalmente
     * @param {boolean} enabled 
     * @param {boolean} triggerSave
     */
    function setNormalizationEnabled(enabled, triggerSave = true) {
        ensureSettingsStructure();
        window.projectData.settings.normalization.enabled = enabled;

        if (triggerSave && window.triggerAutoSave) {
            window.triggerAutoSave();
        }
    }

    /**
     * Obtiene todos los settings de normalización
     * @returns {object}
     */
    function getNormalizationSettings() {
        ensureSettingsStructure();
        return window.projectData.settings.normalization;
    }

    /**
     * Resetea los settings de normalización a valores por defecto
     */
    function resetNormalizationDefaults() {
        ensureSettingsStructure();
        window.projectData.settings.normalization = JSON.parse(JSON.stringify(DEFAULTS.normalization));

        if (window.triggerAutoSave) {
            window.triggerAutoSave();
        }
    }

    /**
     * Obtiene los valores por defecto
     * @returns {object}
     */
    function getDefaults() {
        return JSON.parse(JSON.stringify(DEFAULTS));
    }

    // API Pública
    return {
        ensureSettingsStructure,
        getNormalizationFlags,
        isNormalizationEnabled,
        setNormalizationFlags,
        setNormalizationEnabled,
        getNormalizationSettings,
        resetNormalizationDefaults,
        getDefaults,
        DEFAULTS
    };
})();

// Exportar globalmente
window.AppConfig = AppConfig;
