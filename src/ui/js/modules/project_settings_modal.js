/**
 * ProjectSettingsModal - Modal de configuración del proyecto
 * 
 * Actualmente incluye:
 * - Configuración de normalización de placeholders
 */
const ProjectSettingsModal = (function () {
    'use strict';

    let modalElement = null;

    /**
     * Crea el HTML del modal
     */
    function createModalHTML() {
        const settings = window.AppConfig?.getNormalizationSettings() || {
            enabled: true,
            flags: { trim: true, collapse: true, lowercase: true, accents: true }
        };

        return `
            <div id="modal-project-settings" class="af-modal-overlay">
                <div class="af-modal-window accent-blue" style="width: 480px;">
                    <!-- Header -->
                    <div class="af-window-header">
                        <div class="af-window-title">
                            <i data-lucide="settings" class="w-5 h-5 text-blue-500"></i>
                            <span>Configuración del Proyecto</span>
                        </div>
                        <div class="af-window-close" id="settings-close-btn">
                            <i data-lucide="x" class="w-5 h-5"></i>
                        </div>
                    </div>

                    <!-- Body -->
                    <div class="af-window-body">
                        <!-- Normalization Section -->
                        <div class="settings-section">
                            <div class="settings-section-header">
                                <i data-lucide="text-cursor-input" class="w-4 h-4"></i>
                                <span>Normalización de Placeholders</span>
                            </div>
                            <p class="settings-description">
                                Controla cómo se comparan los nombres de columnas, variables y conceptos.
                            </p>

                            <!-- Master Toggle -->
                            <label class="settings-toggle-row master-toggle">
                                <span class="toggle-label">
                                    <strong>Habilitar normalización</strong>
                                    <small>Permite coincidencias flexibles al buscar placeholders</small>
                                </span>
                                <input type="checkbox" id="norm-enabled" ${settings.enabled ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>

                            <!-- Flags Container -->
                            <div id="norm-flags-container" class="${settings.enabled ? '' : 'disabled'}">
                                <label class="settings-checkbox-row">
                                    <input type="checkbox" id="norm-trim" ${settings.flags?.trim ? 'checked' : ''}>
                                    <span class="checkbox-custom"></span>
                                    <span class="checkbox-label">
                                        Eliminar espacios inicio/final
                                        <small>"  Nombre  " → "Nombre"</small>
                                    </span>
                                </label>

                                <label class="settings-checkbox-row">
                                    <input type="checkbox" id="norm-collapse" ${settings.flags?.collapse ? 'checked' : ''}>
                                    <span class="checkbox-custom"></span>
                                    <span class="checkbox-label">
                                        Colapsar espacios múltiples
                                        <small>"Nombre   Apellido" → "Nombre Apellido"</small>
                                    </span>
                                </label>

                                <label class="settings-checkbox-row">
                                    <input type="checkbox" id="norm-lowercase" ${settings.flags?.lowercase ? 'checked' : ''}>
                                    <span class="checkbox-custom"></span>
                                    <span class="checkbox-label">
                                        Ignorar mayúsculas/minúsculas
                                        <small>"NOMBRE" = "nombre" = "Nombre"</small>
                                    </span>
                                </label>

                                <label class="settings-checkbox-row">
                                    <input type="checkbox" id="norm-accents" ${settings.flags?.accents ? 'checked' : ''}>
                                    <span class="checkbox-custom"></span>
                                    <span class="checkbox-label">
                                        Ignorar acentos
                                        <small>"José" = "Jose"</small>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="af-window-footer">
                        <button id="settings-reset-btn" class="af-btn-ghost">
                            <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                            Restablecer
                        </button>
                        <button id="settings-save-btn" class="af-btn-primary">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Abre el modal de settings
     */
    function openModal() {
        // Remover modal existente si hay
        const existing = document.getElementById('modal-project-settings');
        if (existing) existing.remove();

        // Crear nuevo modal
        const container = document.createElement('div');
        container.innerHTML = createModalHTML();
        modalElement = container.firstElementChild;
        document.body.appendChild(modalElement);

        // Setup eventos
        setupEventListeners();

        // Abrir con ModalManager
        if (window.ModalManager) {
            const win = modalElement.querySelector('.af-modal-window');
            const header = modalElement.querySelector('.af-window-header');
            window.ModalManager.makeDraggable(win, header);
            window.ModalManager.openModal(modalElement);
        } else {
            modalElement.style.display = 'flex';
        }

        // Crear iconos
        if (window.lucide) lucide.createIcons();
    }

    /**
     * Cierra el modal
     */
    function closeModal() {
        if (!modalElement) return;

        if (window.ModalManager) {
            window.ModalManager.closeModal(modalElement);
        } else {
            modalElement.remove();
        }
        modalElement = null;
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        if (!modalElement) return;

        // Close button
        modalElement.querySelector('#settings-close-btn')?.addEventListener('click', closeModal);

        // Master toggle
        const enabledToggle = modalElement.querySelector('#norm-enabled');
        const flagsContainer = modalElement.querySelector('#norm-flags-container');

        enabledToggle?.addEventListener('change', (e) => {
            if (e.target.checked) {
                flagsContainer?.classList.remove('disabled');
            } else {
                flagsContainer?.classList.add('disabled');
            }
        });

        // Save button
        modalElement.querySelector('#settings-save-btn')?.addEventListener('click', saveSettings);

        // Reset button
        modalElement.querySelector('#settings-reset-btn')?.addEventListener('click', resetToDefaults);

        // Close on backdrop click
        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement) closeModal();
        });
    }

    /**
     * Guarda los settings
     */
    function saveSettings() {
        if (!modalElement) return;

        const enabled = modalElement.querySelector('#norm-enabled')?.checked ?? true;
        const flags = {
            trim: modalElement.querySelector('#norm-trim')?.checked ?? true,
            collapse: modalElement.querySelector('#norm-collapse')?.checked ?? true,
            lowercase: modalElement.querySelector('#norm-lowercase')?.checked ?? true,
            accents: modalElement.querySelector('#norm-accents')?.checked ?? true
        };

        if (window.AppConfig) {
            window.AppConfig.setNormalizationEnabled(enabled, false);
            window.AppConfig.setNormalizationFlags(flags, true);
        } else {
            // Fallback directo
            window.projectData.settings = window.projectData.settings || {};
            window.projectData.settings.normalization = { enabled, flags };
            if (window.triggerAutoSave) window.triggerAutoSave();
        }

        closeModal();

        // Notificación
        if (window.bridgePy) {
            window.bridgePy.setStatus('check', 'Configuración guardada');
        }
    }

    /**
     * Resetea a valores por defecto
     */
    function resetToDefaults() {
        if (!modalElement) return;

        // Reset checkboxes a valores por defecto (todos true)
        modalElement.querySelector('#norm-enabled').checked = true;
        modalElement.querySelector('#norm-trim').checked = true;
        modalElement.querySelector('#norm-collapse').checked = true;
        modalElement.querySelector('#norm-lowercase').checked = true;
        modalElement.querySelector('#norm-accents').checked = true;

        // Enable flags container
        modalElement.querySelector('#norm-flags-container')?.classList.remove('disabled');
    }

    // API Pública
    return {
        openModal,
        closeModal
    };
})();

// Exportar globalmente
window.ProjectSettingsModal = ProjectSettingsModal;
