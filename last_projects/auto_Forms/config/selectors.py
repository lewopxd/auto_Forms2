"""
MS Forms DOM Selectors
Based on real MS Forms HTML structure.
"""

# Question containers
QUESTION_SELECTORS = {
    "container": '[data-automation-id="questionItem"]',
    "title": '[data-automation-id="questionTitle"]',
    "title_text": '[data-automation-id="questionTitle"] .text-format-content',
    "ordinal": '[data-automation-id="questionOrdinal"]',
    "subtitle": '[data-automation-id="questionSubTitle"]',
    "required_star": '[data-automation-id="requiredStar"]',
    "section_title": '[data-automation-id="sectionTitle"]',
}

# Input elements
INPUT_SELECTORS = {
    "text_input": '[data-automation-id="textInput"]',
    "choice_item": '[data-automation-id="choiceItem"]',
    "radio_group": '[role="radiogroup"]',
    "checkbox": '[role="checkbox"]',
    "dropdown": '[role="listbox"]',
    "date_picker": '[data-automation-id="datePicker"]',
    "rating": '[data-automation-id="ratingItem"]',
}

# Navigation
NAVIGATION_SELECTORS = {
    "next_button": '[data-automation-id="nextButton"]',
    "back_button": '[data-automation-id="backButton"]',
    "submit_button": '[data-automation-id="submitButton"]',
    "progress_bar": '#single-progress-bar',
    "progress_container": '[role="progressbar"]',
}

# Page structure
PAGE_SELECTORS = {
    "form_title": '[data-automation-id="formTitle"]',
    "form_description": '[data-automation-id="formDescription"]',
}

# Placeholder patterns to detect input type
PLACEHOLDER_PATTERNS = {
    "number": "número entero",
    "text": "respuesta",
}
