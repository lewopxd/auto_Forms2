/**
 * Toast Notifications Module
 * Lightweight notification system for AutoForms
 * 
 * Usage:
 *   window.toast.success('Title', 'Message');
 *   window.toast.error('Title', 'Message');
 *   window.toast.warn('Title', 'Message');
 *   window.toast.info('Title', 'Message');
 */

(function () {
    'use strict';

    // Configuration
    const TOAST_DURATION = 4000;      // Default display time in ms
    const ANIMATION_DURATION = 300;   // Slide animation duration
    const BOTTOM_OFFSET = 100;        // Distance from bottom of screen

    // Toast types with colors
    const TOAST_TYPES = {
        success: {
            icon: 'check-circle',
            bgColor: '#ecfdf5',        // Light green
            borderColor: '#10b981',    // Green
            textColor: '#065f46',      // Dark green
            iconColor: '#10b981'
        },
        error: {
            icon: 'x-circle',
            bgColor: '#fef2f2',        // Light red
            borderColor: '#ef4444',    // Red
            textColor: '#991b1b',      // Dark red
            iconColor: '#ef4444'
        },
        warn: {
            icon: 'alert-triangle',
            bgColor: '#fffbeb',        // Light amber
            borderColor: '#f59e0b',    // Amber/Yellow-orange
            textColor: '#92400e',      // Dark amber
            iconColor: '#f59e0b'
        },
        info: {
            icon: 'info',
            bgColor: '#eff6ff',        // Light blue
            borderColor: '#3b82f6',    // Blue
            textColor: '#1e40af',      // Dark blue
            iconColor: '#3b82f6'
        }
    };

    // Container for toasts
    let toastContainer = null;
    let toastQueue = [];

    /**
     * Initialize toast container
     */
    function ensureContainer() {
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        return toastContainer;
    }

    /**
     * Create and show a toast notification
     * @param {string} type - Toast type: success, error, warn, info
     * @param {string} title - Toast title
     * @param {string} message - Toast message (optional)
     * @param {number} duration - Display duration in ms (optional)
     */
    function showToast(type, title, message = '', duration = TOAST_DURATION) {
        const container = ensureContainer();
        const config = TOAST_TYPES[type] || TOAST_TYPES.info;

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.style.cssText = `
            background-color: ${config.bgColor};
            border-color: ${config.borderColor};
            color: ${config.textColor};
        `;

        // Toast content
        toast.innerHTML = `
            <div class="toast-icon" style="color: ${config.iconColor};">
                <i data-lucide="${config.icon}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" style="color: ${config.textColor};">
                <i data-lucide="x"></i>
            </button>
        `;

        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => dismissToast(toast));

        // Add to container
        container.appendChild(toast);
        toastQueue.push(toast);

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons({ nodes: [toast] });
        }

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-visible');
        });

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => dismissToast(toast), duration);
        }

        return toast;
    }

    /**
     * Dismiss a toast with exit animation
     */
    function dismissToast(toast) {
        if (!toast || toast.classList.contains('toast-dismissing')) return;

        toast.classList.add('toast-dismissing');
        toast.classList.remove('toast-visible');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            // Remove from queue
            const idx = toastQueue.indexOf(toast);
            if (idx > -1) toastQueue.splice(idx, 1);
        }, ANIMATION_DURATION);
    }

    /**
     * Clear all toasts
     */
    function clearAll() {
        toastQueue.forEach(t => dismissToast(t));
    }

    // Public API
    window.toast = {
        success: (title, message, duration) => showToast('success', title, message, duration),
        error: (title, message, duration) => showToast('error', title, message, duration),
        warn: (title, message, duration) => showToast('warn', title, message, duration),
        info: (title, message, duration) => showToast('info', title, message, duration),
        show: showToast,
        dismiss: dismissToast,
        clearAll: clearAll
    };

    console.log('[Toast] Notification module initialized');
})();
