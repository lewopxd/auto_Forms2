"""
JavaScript Injector
Injects UI overlay and communicates with it.
"""
import os
import json

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "..", "injected_ui", "script.js")


def load_script() -> str:
    """Load the injection script."""
    with open(SCRIPT_PATH, 'r', encoding='utf-8') as f:
        return f.read()


def inject_ui(driver) -> bool:
    """Inject the overlay UI into current page."""
    try:
        script = load_script()
        driver.execute_script(script)
        return True
    except Exception as e:
        print(f"[Error] Injection failed: {e}")
        return False


def reload_ui(driver) -> bool:
    """Remove existing UI and re-inject fresh version."""
    try:
        driver.execute_script("""
            const existing = document.getElementById('__msfa_root__');
            if (existing) existing.remove();
        """)
        return inject_ui(driver)
    except Exception as e:
        print(f"[Error] Reload failed: {e}")
        return False


def set_form_data(driver, data: dict):
    """Send complete form data to the injected UI."""
    script = f"window.__msfa_setFormData({json.dumps(data)})"
    driver.execute_script(script)


# Legacy compatibility
def set_questions(driver, questions: list):
    """Legacy: send questions to UI."""
    set_form_data(driver, questions)
