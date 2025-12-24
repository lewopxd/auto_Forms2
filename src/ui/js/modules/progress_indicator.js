/**
 * ProgressIndicator Module
 * 
 * Displays a progress ring INSIDE each AutoForms tab container
 * showing answered/total questions and validation status.
 * 
 * Usage (from autoform_view.js):
 *   ProgressIndicator.init(containerId, tabId, formData)
 */
const ProgressIndicator = (function () {
    'use strict';

    let cssInjected = false;

    // ========================================
    // CSS INJECTION
    // ========================================
    function injectCSS() {
        if (cssInjected) return;
        cssInjected = true;

        const css = `
            .afp-indicator {
                position: absolute;
                top: 12px;
                right: 16px;
                z-index: 100;
                pointer-events: auto;
            }

            .afp-ring-container {
                position: relative;
                width: 48px;
                height: 48px;
            }

            .afp-ring {
                width: 48px;
                height: 48px;
                position: relative;
            }

            .afp-ring svg {
                width: 100%;
                height: 100%;
                transform: rotate(-90deg);
            }

            .afp-ring-inner {
                position: absolute;
                top: 5px;
                left: 5px;
                right: 5px;
                bottom: 5px;
                background: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .afp-ring-text {
                font-size: 10px;
                font-weight: 700;
                color: #f97316;
                font-family: 'Inter', sans-serif;
            }

            .afp-status {
                position: absolute;
                right: -6px;
                top: 50%;
                transform: translateY(-50%);
                width: 18px;
                height: 18px;
                background: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border: 1px solid #f97316;
            }

            .afp-status-icon {
                transition: transform 0.15s ease;
            }

            .afp-status:hover .afp-status-icon {
                transform: scale(1.1);
            }

            .afp-card {
                position: absolute;
                right: calc(100% + 40px);
                top: 50%;
                transform: translateY(-50%) translateX(8px);
                background: #fef3c7;
                border: 1px solid #fcd34d;
                color: #92400e;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 500;
                max-width: 220px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease, transform 0.2s ease;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }

            .afp-card::after {
                content: '';
                position: absolute;
                right: -7px;
                top: 50%;
                transform: translateY(-50%);
                border: 7px solid transparent;
                border-left-color: #fcd34d;
            }

            .afp-card::before {
                content: '';
                position: absolute;
                right: -6px;
                top: 50%;
                transform: translateY(-50%);
                border: 6px solid transparent;
                border-left-color: #fef3c7;
                z-index: 1;
            }

            .afp-card.success {
                background: #dcfce7;
                border-color: #86efac;
                color: #166534;
            }

            .afp-card.success::after {
                border-left-color: #86efac;
            }

            .afp-card.success::before {
                border-left-color: #dcfce7;
            }

            .afp-status:hover .afp-card {
                opacity: 1;
                transform: translateY(-50%) translateX(0);
            }
        `;

        const style = document.createElement('style');
        style.id = 'afp-indicator-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ========================================
    // QUESTION ANALYSIS
    // ========================================

    function isQuestionAnswered(question) {
        const response = question.response || '';
        if (response.trim() !== '') return true;

        // Mapping with non-empty map
        if (question.config?.mapping?.enabled && question.config?.mapping?.placeholder) {
            const map = question.config.mapping.map || {};
            if (Object.keys(map).length > 0) return true;
        }

        // Has placeholders
        if (response && (response.includes('{') || response.includes('[[') || response.includes('{$'))) {
            return true;
        }

        return false;
    }

    function analyzeQuestions(formData) {
        const result = {
            total: 0,
            answered: 0,
            requiredUnanswered: 0,
            unansweredList: []
        };

        if (!formData?.pages) return result;

        let questionNum = 0;
        Object.values(formData.pages).forEach(page => {
            if (page.isPostSubmitPage) return;

            Object.values(page.questions || {}).forEach(q => {
                questionNum++;
                result.total++;
                const answered = isQuestionAnswered(q);
                if (answered) result.answered++;

                if (q.required && !answered) {
                    result.requiredUnanswered++;
                    const shortText = (q.text || 'Pregunta').substring(0, 30);
                    result.unansweredList.push({
                        num: questionNum,
                        text: shortText + (q.text && q.text.length > 30 ? '...' : '')
                    });
                }
            });
        });

        return result;
    }

    // ========================================
    // SVG RING
    // ========================================

    function buildRingSVG(answered, total) {
        const cx = 24, cy = 24, radius = 20, strokeWidth = 4;
        const circumference = 2 * Math.PI * radius;

        if (total === 0) {
            return `<svg viewBox="0 0 48 48"><circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}"/></svg>`;
        }

        const progress = answered / total;
        const progressLength = circumference * progress;
        const remainingLength = circumference - progressLength;

        return `<svg viewBox="0 0 48 48">
            <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}"/>
            <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#f97316" stroke-width="${strokeWidth}" stroke-dasharray="${progressLength} ${remainingLength}" stroke-linecap="round"/>
        </svg>`;
    }

    // ========================================
    // RENDER INSIDE CONTAINER
    // ========================================

    function init(containerId, tabId, formData) {
        injectCSS();

        const container = document.getElementById(containerId);
        if (!container) return;

        // Ensure container has relative positioning
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // Remove existing indicator for this tab
        const existing = container.querySelector(`.afp-indicator[data-tab="${tabId}"]`);
        if (existing) existing.remove();

        // Analyze questions
        const stats = analyzeQuestions(formData);
        if (stats.total === 0) return; // No questions to show

        // Build status icon and card
        let statusIcon, cardContent, cardClass;
        if (stats.requiredUnanswered > 0) {
            statusIcon = `<svg class="afp-status-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
            const plural = stats.requiredUnanswered > 1;
            const header = `<strong>${stats.requiredUnanswered} pregunta${plural ? 's' : ''} obligatoria${plural ? 's' : ''} sin responder</strong>`;
            const list = stats.unansweredList.slice(0, 5).map(q => `<div style="margin-top:4px;font-size:10px;opacity:0.9;">${q.num}. ${q.text}</div>`).join('');
            const more = stats.unansweredList.length > 5 ? `<div style="margin-top:4px;font-size:10px;opacity:0.7;">...y ${stats.unansweredList.length - 5} más</div>` : '';
            cardContent = header + list + more;
            cardClass = '';
        } else {
            statusIcon = `<svg class="afp-status-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
            cardContent = 'Todas las obligatorias respondidas';
            cardClass = 'success';
        }

        // Create indicator element
        const indicator = document.createElement('div');
        indicator.className = 'afp-indicator';
        indicator.dataset.tab = tabId;

        indicator.innerHTML = `
            <div class="afp-ring-container">
                <div class="afp-ring">
                    ${buildRingSVG(stats.answered, stats.total)}
                    <div class="afp-ring-inner">
                        <span class="afp-ring-text">${stats.answered}/${stats.total}</span>
                    </div>
                </div>
                <div class="afp-status">
                    ${statusIcon}
                    <div class="afp-card ${cardClass}">${cardContent}</div>
                </div>
            </div>
        `;

        // Append INSIDE the container
        container.appendChild(indicator);
    }

    function destroy(tabId) {
        const indicator = document.querySelector(`.afp-indicator[data-tab="${tabId}"]`);
        if (indicator) indicator.remove();
    }

    return { init, destroy };
})();

window.ProgressIndicator = ProgressIndicator;
