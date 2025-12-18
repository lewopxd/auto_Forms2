"""
UI Injector - Shadow DOM version
CSS is now embedded in script.js, no separate file needed
"""
import os


INJECTED_UI_DIR = os.path.join(os.path.dirname(__file__), "..", "injected_ui")


def get_injection_script() -> str:
    """Load the injection script."""
    js_path = os.path.join(INJECTED_UI_DIR, "script.js")
    with open(js_path, 'r', encoding='utf-8') as f:
        return f.read()


def inject_ui(driver) -> bool:
    """Inject the overlay UI into the current page."""
    try:
        script = get_injection_script()
        driver.execute_script(script)
        return True
    except Exception as e:
        print(f"[MSFA] Injection error: {e}")
        return False
