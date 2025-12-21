"""
Form Analyzer - Complete Analysis with Selenium Data
Extracts all form details including selectors for automation.
"""
from typing import Dict, Any


def analyze_form(driver) -> Dict[str, Any]:
    """Complete form analysis with Selenium automation data."""
    
    js_code = """
    try {
        const result = {
            url: window.location.href,
            pageInfo: { current: 1, total: 1, text: '' },
            hasNextButton: false,
            hasBackButton: false,
            hasSubmitButton: false,
            isPostSubmitPage: false,
            formTitle: '',
            questions: []
        };
        
        // Page info from progress bar
        const progressBar = document.querySelector('#single-progress-bar');
        if (progressBar) {
            result.pageInfo.text = progressBar.textContent.trim();
            const match = result.pageInfo.text.match(/(\\d+)\\s*(?:de|of)\\s*(\\d+)/i);
            if (match) {
                result.pageInfo.current = parseInt(match[1]);
                result.pageInfo.total = parseInt(match[2]);
            }
        }
        
        // Navigation buttons with selectors
        const nextBtn = document.querySelector('[data-automation-id="nextButton"]');
        const backBtn = document.querySelector('[data-automation-id="backButton"]');
        const submitBtn = document.querySelector('[data-automation-id="submitButton"]');
        
        // Post-submit buttons (appear after form submission)
        const saveAndEditBtn = document.querySelector('[data-automation-id="saveAndEditButton"]');
        const submitAnotherBtn = document.querySelector('[data-automation-id="submitAnother"]');
        
        result.hasNextButton = nextBtn !== null;
        result.hasBackButton = backBtn !== null;
        result.hasSubmitButton = submitBtn !== null;
        result.isPostSubmitPage = saveAndEditBtn !== null || submitAnotherBtn !== null;
        
        result.navigation = {
            next: nextBtn ? { selector: '[data-automation-id="nextButton"]', text: nextBtn.textContent.trim() } : null,
            back: backBtn ? { selector: '[data-automation-id="backButton"]', text: backBtn.textContent.trim() } : null,
            submit: submitBtn ? { selector: '[data-automation-id="submitButton"]', text: submitBtn.textContent.trim() } : null
        };
        
        // Post-submit actions (click actions after submission)
        result.postSubmitActions = {
            saveAndEdit: saveAndEditBtn ? {
                selector: '[data-automation-id="saveAndEditButton"]',
                text: saveAndEditBtn.textContent.trim(),
                action: 'click'
            } : null,
            submitAnother: submitAnotherBtn ? {
                selector: '[data-automation-id="submitAnother"]',
                text: submitAnotherBtn.textContent.trim() || 'Enviar otra respuesta',
                action: 'click'
            } : null
        };
        
        // Form title
        const titleEl = document.querySelector('[data-automation-id="formTitle"]');
        if (titleEl) result.formTitle = titleEl.textContent.trim();
        
        // Questions
        document.querySelectorAll('[data-automation-id="questionItem"]').forEach((item, i) => {
            const titleEl = item.querySelector('[data-automation-id="questionTitle"] .text-format-content');
            const ordinalEl = item.querySelector('[data-automation-id="questionOrdinal"]');
            const subtitleEl = item.querySelector('[data-automation-id="questionSubTitle"]');
            const requiredEl = item.querySelector('[data-automation-id="requiredStar"]');
            const inputEl = item.querySelector('[data-automation-id="textInput"]');
            
            // Get question ID from container
            let questionId = null;
            const containerWithId = item.querySelector('[id^="QuestionId_"]');
            if (containerWithId) {
                const idMatch = containerWithId.id.match(/QuestionId_([a-zA-Z0-9]+)/);
                if (idMatch) questionId = idMatch[1];
            }
            
            // Detect input type and build selenium data
            let inputType = 'unknown';
            let inputSubtype = null;
            let selenium = null;
            
            if (inputEl) {
                inputType = inputEl.tagName === 'TEXTAREA' ? 'long_text' : 'text';
                const placeholder = (inputEl.placeholder || '').toLowerCase();
                const inputTypeAttr = inputEl.getAttribute('type') || '';
                
                const isNumber = 
                    inputTypeAttr === 'number' ||
                    placeholder.includes('número entero') ||
                    placeholder.includes('numero entero') ||
                    placeholder.includes('integer') ||
                    placeholder.includes('number');
                
                if (isNumber) inputSubtype = 'number';
                
                // Selenium data for text input
                selenium = {
                    action: 'fill',
                    selector: '[data-automation-id="textInput"]',
                    fullSelector: questionId ? 
                        '[aria-labelledby*="QuestionId_' + questionId + '"][data-automation-id="textInput"]' :
                        null,
                    method: 'send_keys'
                };
            }
            
            // Check for radio/choice
            const radioGroup = item.querySelector('[role="radiogroup"]');
            if (radioGroup) {
                inputType = 'choice';
                selenium = {
                    action: 'select',
                    selector: '[role="radiogroup"]',
                    questionId: questionId,
                    method: 'click'
                };
            }
            
            // Check for dropdown
            if (item.querySelector('[role="listbox"]')) inputType = 'dropdown';
            if (item.querySelector('[data-automation-id="datePicker"]')) inputType = 'date';
            if (item.querySelector('[data-automation-id="ratingItem"]')) inputType = 'rating';
            
            // Extract choice options with selenium data
            let options = [];
            if (inputType === 'choice' || inputType === 'dropdown') {
                item.querySelectorAll('[data-automation-id="choiceItem"]').forEach((choice, optIdx) => {
                    const radioSpan = choice.querySelector('[data-automation-value]');
                    const radioInput = choice.querySelector('input[type="radio"]');
                    
                    if (radioSpan || radioInput) {
                        const value = radioSpan ? radioSpan.getAttribute('data-automation-value') : 
                                     (radioInput ? radioInput.value : '');
                        const posInSet = radioInput ? radioInput.getAttribute('aria-posinset') : String(optIdx + 1);
                        
                        options.push({
                            text: value,
                            value: value,
                            position: posInSet,
                            selenium: {
                                byValue: '[data-automation-value="' + value.replace(/"/g, '\\\\"') + '"]',
                                byInputValue: 'input[value="' + value.replace(/"/g, '\\\\"') + '"]',
                                byPosition: '[aria-posinset="' + posInSet + '"]',
                                method: 'click'
                            }
                        });
                    }
                });
            }
            
            result.questions.push({
                index: i,
                ordinal: ordinalEl ? ordinalEl.textContent.trim().replace('.', '') : String(i + 1),
                text: titleEl ? titleEl.textContent.trim() : '',
                subtitle: subtitleEl ? subtitleEl.textContent.trim() : '',
                required: requiredEl !== null,
                type: inputType,
                subtype: inputSubtype,
                questionId: questionId,
                options: options,
                selenium: selenium
            });
        });
        
        return result;
    } catch (e) {
        return { error: e.message, questions: [], pageInfo: { current: 1, total: 1, text: '' }, hasNextButton: false };
    }
    """
    
    return driver.execute_script(js_code)


def get_questions_for_ui(driver) -> dict:
    """Get form data for UI display."""
    data = analyze_form(driver)
    
    questions = []
    for q in data.get("questions", []):
        type_label = q["type"]
        if q.get("subtype"):
            type_label = f"{q['type']} ({q['subtype']})"
        
        questions.append({
            "num": q["ordinal"],
            "text": q["text"],
            "type": type_label,
            "required": q["required"],
            "options": q.get("options", []),
            "questionId": q.get("questionId"),
            "selenium": q.get("selenium")
        })
    
    return {
        "url": data.get("url", ""),
        "formTitle": data.get("formTitle", ""),
        "questions": questions,
        "pageInfo": data.get("pageInfo", {}),
        "hasNext": data.get("hasNextButton", False),
        "hasBack": data.get("hasBackButton", False),
        "hasSubmit": data.get("hasSubmitButton", False),
        "isPostSubmitPage": data.get("isPostSubmitPage", False),
        "navigation": data.get("navigation", {}),
        "postSubmitActions": data.get("postSubmitActions", {})
    }
