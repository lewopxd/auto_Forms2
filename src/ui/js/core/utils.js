/**
 * Utils - Funciones auxiliares reutilizables
 * 
 * Incluye:
 * - Normalización de texto con flags configurables
 * - Comparación inteligente con reporte de tipo de match
 */
const Utils = (function () {
    'use strict';

    /**
     * Normaliza texto según flags especificados
     * @param {string} text - Texto a normalizar
     * @param {object} flags - { trim, collapse, lowercase, accents }
     * @returns {string} Texto normalizado
     */
    function normalize(text, flags = {}) {
        if (text === null || text === undefined) return '';
        let result = String(text);

        // Orden de aplicación: trim → collapse → lowercase → accents
        if (flags.trim) {
            result = result.trim();
        }

        if (flags.collapse) {
            result = result.replace(/\s+/g, ' ');
        }

        if (flags.lowercase) {
            result = result.toLowerCase();
        }

        if (flags.accents) {
            result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        return result;
    }

    /**
     * Compara dos textos con normalización progresiva
     * Intenta match exacto primero, luego aplica normalizaciones una a una
     * 
     * @param {string} textA - Primer texto
     * @param {string} textB - Segundo texto
     * @param {object} flags - Flags de normalización habilitados
     * @returns {object} { match: boolean, type: string|null, normalized: { a, b } }
     */
    function compare(textA, textB, flags = null) {
        // Si no se pasan flags, usar los del proyecto
        if (flags === null) {
            flags = window.AppConfig?.getNormalizationFlags() || {
                trim: true,
                collapse: true,
                lowercase: true,
                accents: true
            };
        }

        const strA = String(textA ?? '');
        const strB = String(textB ?? '');

        // 1. Match exacto (sin normalización)
        if (strA === strB) {
            return {
                match: true,
                type: 'exact',
                normalized: { a: strA, b: strB }
            };
        }

        // 2. Aplicar normalizaciones progresivamente
        let normA = strA;
        let normB = strB;
        let matchType = null;

        // Orden de normalización progresiva
        const steps = [
            { flag: 'trim', name: 'trim' },
            { flag: 'collapse', name: 'collapse' },
            { flag: 'lowercase', name: 'lowercase' },
            { flag: 'accents', name: 'accents' }
        ];

        for (const step of steps) {
            if (!flags[step.flag]) continue;

            // Aplicar normalización acumulativa
            const stepFlags = {};
            for (const s of steps) {
                if (s.flag === step.flag) {
                    stepFlags[s.flag] = true;
                    break;
                }
                if (flags[s.flag]) {
                    stepFlags[s.flag] = true;
                }
            }
            // Incluir el paso actual
            stepFlags[step.flag] = true;

            normA = normalize(strA, stepFlags);
            normB = normalize(strB, stepFlags);

            if (normA === normB) {
                matchType = step.name;
                break;
            }
        }

        // 3. Si no hubo match progresivo, intentar con todos los flags
        if (!matchType) {
            normA = normalize(strA, flags);
            normB = normalize(strB, flags);

            if (normA === normB) {
                matchType = 'full';
            }
        }

        return {
            match: matchType !== null,
            type: matchType,
            normalized: { a: normA, b: normB }
        };
    }

    /**
     * Compara si dos textos son equivalentes (shorthand)
     * @param {string} textA 
     * @param {string} textB 
     * @param {object} flags 
     * @returns {boolean}
     */
    function equals(textA, textB, flags = null) {
        const result = compare(textA, textB, flags);
        // DEBUG: Uncomment to see comparisons
        // console.log('[Utils.equals]', JSON.stringify(textA), 'vs', JSON.stringify(textB), '→', result.match, result.type);
        return result.match;
    }

    /**
     * Busca un valor en un objeto por clave con normalización
     * @param {string} key - Clave a buscar
     * @param {object} obj - Objeto donde buscar
     * @param {object} flags - Flags de normalización
     * @returns {{ value: any, foundKey: string|null, matchType: string|null }}
     */
    function findInObject(key, obj, flags = null) {
        if (!obj || !key) {
            return { value: undefined, foundKey: null, matchType: null };
        }

        const keys = Object.keys(obj);

        // 1. Match exacto primero
        if (obj[key] !== undefined) {
            return { value: obj[key], foundKey: key, matchType: 'exact' };
        }

        // 2. Buscar con normalización
        for (const k of keys) {
            const result = compare(key, k, flags);
            if (result.match) {
                return { value: obj[k], foundKey: k, matchType: result.type };
            }
        }

        return { value: undefined, foundKey: null, matchType: null };
    }

    // API Pública
    return {
        normalize,
        compare,
        equals,
        findInObject
    };
})();

// Exportar globalmente
window.Utils = Utils;
