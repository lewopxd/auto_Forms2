"""
JavaScript Injector
Injects UI overlay into browser and communicates with it.
"""
import os
import json

# Path to injected UI scripts
INJECTED_UI_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "injected_ui")


def get_script_path() -> str:
    """Get path to the injection script."""
    return os.path.join(INJECTED_UI_DIR, "script.js")


def load_script() -> str:
    """Load the injection script content."""
    script_path = get_script_path()
    if not os.path.exists(script_path):
        raise FileNotFoundError(f"Injection script not found: {script_path}")
    
    with open(script_path, 'r', encoding='utf-8') as f:
        return f.read()


def inject_ui(driver) -> bool:
    """
    Inject the overlay UI into current page.
    
    Args:
        driver: Selenium WebDriver instance
        
    Returns:
        True if injection successful, False otherwise
    """
    try:
        script = load_script()
        driver.execute_script(script)
        print("[JSInjector] UI injected successfully")
        return True
    except FileNotFoundError as e:
        print(f"[JSInjector] Script not found: {e}")
        return False
    except Exception as e:
        print(f"[JSInjector] Injection failed: {e}")
        return False


def reload_ui(driver) -> bool:
    """
    Remove existing UI and re-inject fresh version.
    
    Args:
        driver: Selenium WebDriver instance
        
    Returns:
        True if reload successful, False otherwise
    """
    try:
        driver.execute_script("""
            const existing = document.getElementById('__msfa_root__');
            if (existing) existing.remove();
        """)
        return inject_ui(driver)
    except Exception as e:
        print(f"[JSInjector] Reload failed: {e}")
        return False


def set_form_data(driver, data: dict):
    """
    Send complete form data to the injected UI.
    
    Args:
        driver: Selenium WebDriver instance
        data: Form data dictionary
    """
    driver.execute_script("window.__msfa_setFormData(arguments[0])", data)


def get_commands(driver) -> list:
    """
    Get pending commands from the injected UI.
    
    Args:
        driver: Selenium WebDriver instance
        
    Returns:
        List of pending commands
    """
    try:
        commands = driver.execute_script("""
            const cmds = window.__msfa_commands || [];
            window.__msfa_commands = [];
            return cmds;
        """)
        return commands or []
    except Exception:
        return []


def notify_saved(driver):
    """Notify the injected UI that data was saved."""
    try:
        driver.execute_script("if(window.__msfa_onSaved) window.__msfa_onSaved();")
    except Exception:
        pass


def is_ui_injected(driver) -> bool:
    """Check if the UI is already injected."""
    try:
        result = driver.execute_script(
            "return document.getElementById('__msfa_root__') !== null;"
        )
        return bool(result)
    except Exception:
        return False


# ============================================================
# LOGIN MODE UI FUNCTIONS
# ============================================================

def get_login_script_path() -> str:
    """Get path to the login mode script."""
    return os.path.join(INJECTED_UI_DIR, "login_script.js")


def load_login_script() -> str:
    """Load the login mode script content."""
    script_path = get_login_script_path()
    if not os.path.exists(script_path):
        raise FileNotFoundError(f"Login script not found: {script_path}")
    
    with open(script_path, 'r', encoding='utf-8') as f:
        return f.read()


def inject_login_ui(driver) -> bool:
    """
    Inject the login wait UI into current page.
    
    Args:
        driver: Selenium WebDriver instance
        
    Returns:
        True if injection successful, False otherwise
    """
    try:
        script = load_login_script()
        driver.execute_script(script)
        print("[JSInjector] Login UI injected successfully")
        return True
    except FileNotFoundError as e:
        print(f"[JSInjector] Login script not found: {e}")
        return False
    except Exception as e:
        print(f"[JSInjector] Login UI injection failed: {e}")
        return False


def is_login_ui_injected(driver) -> bool:
    """Check if the login UI is already injected."""
    try:
        result = driver.execute_script(
            "return document.getElementById('__msfa_login_root__') !== null;"
        )
        return bool(result)
    except Exception:
        return False


def remove_login_ui(driver) -> bool:
    """Remove the login UI if it exists."""
    try:
        driver.execute_script("""
            const existing = document.getElementById('__msfa_login_root__');
            if (existing) existing.remove();
        """)
        return True
    except Exception:
        return False
